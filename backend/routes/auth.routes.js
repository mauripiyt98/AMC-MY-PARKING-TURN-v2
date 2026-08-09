'use strict';

const router         = require('express').Router();
const UsuarioService = require('../services/UsuarioService');
const { validateBody, required, minLen, isEmail } = require('../middleware/validate');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { comparePassword, generateJti } = require('../utils/crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

async function issueOperatorSession(req, operador) {
  const jti = generateJti();
  const token = jwt.sign({
    sub: req.user.id,
    parqueadero_id: req.parqueaderoId,
    rol: operador.tipo === 'OPERADOR' ? 'OPERADOR' : req.user.rol,
    nombre: req.user.nombre,
    jti,
    operador_activo: true,
    operador_id: operador.id,
    operador_nombre: operador.nombre,
    operador_tipo: operador.tipo,
  }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  const { exp } = jwt.decode(token);
  await req.dbClient.query(
    `INSERT INTO sesiones_jwt (usuario_id, parqueadero_id, jti, expira_en, ip_origen, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, req.parqueaderoId, jti, new Date(exp * 1000), req.ip || null, req.headers['user-agent'] || null]
  );
  return { token, expira_en: new Date(exp * 1000).toISOString(), operador, rol: operador.tipo === 'OPERADOR' ? 'OPERADOR' : req.user.rol };
}

/**
 * POST /api/auth/login
 * Body: { documento, password }
 */
router.post('/login',
  validateBody({
    documento         : [required('Documento de usuario requerido')],
    password          : [required('Contraseña requerida')],
  }),
  async (req, res, next) => {
    try {
      const { documento, password } = req.body;
      const meta = {
        ip       : req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
      };
      const result = await UsuarioService.login(documento, password, meta);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/auth/logout
 * Header: Authorization: Bearer <token>
 * Revoca el token actual en la DB.
 */
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    await UsuarioService.logout(req.user.jti);
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (err) {
    next(err);
  }
});

/** Activa al operador que realizarÃ¡ movimientos durante la sesiÃ³n actual. */
router.post('/operadores/activar', authMiddleware, tenantMiddleware, requireRole('ADMIN', 'SUPERADMIN'),
  validateBody({ codigo: [required('CÃ³digo de operador requerido')] }),
  async (req, res, next) => {
    try {
      const codigo = String(req.body.codigo).trim();
      const tipo = String(req.body.tipo || 'OPERADOR').toUpperCase();
      let operador;

      if (tipo === 'PRINCIPAL') {
        const { rows } = await req.dbClient.query(
          `SELECT id, nombre, password_hash FROM usuarios WHERE id = $1 AND parqueadero_id = $2 AND activo = TRUE`,
          [req.user.id, req.parqueaderoId]
        );
        if (!rows[0] || !(await comparePassword(codigo, rows[0].password_hash))) {
          throw Object.assign(new Error('Clave del operador principal incorrecta.'), { statusCode: 401, isOperational: true });
        }
        operador = { id: rows[0].id, nombre: rows[0].nombre, tipo: 'PRINCIPAL' };
      } else {
        const operatorId = String(req.body.operadorId || '');
        const { rows } = await req.dbClient.query(
          `SELECT id, nombre, codigo_hash FROM operadores WHERE id = $1 AND parqueadero_id = $2 AND activo = TRUE`,
          [operatorId, req.parqueaderoId]
        );
        if (!rows[0] || !(await comparePassword(codigo, rows[0].codigo_hash))) {
          throw Object.assign(new Error('CÃ³digo de operador incorrecto.'), { statusCode: 401, isOperational: true });
        }
        operador = { id: rows[0].id, nombre: rows[0].nombre, tipo: 'OPERADOR' };
      }

      const session = await issueOperatorSession(req, operador);
      res.json({ success: true, ...session });
    } catch (err) { next(err); }
  }
);

router.get('/operadores', authMiddleware, tenantMiddleware, requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const { rows } = await req.dbClient.query(
      `SELECT id, nombre FROM operadores WHERE parqueadero_id = $1 AND activo = TRUE ORDER BY nombre`,
      [req.parqueaderoId]
    );
    res.json({ success: true, operadores: rows });
  } catch (err) { next(err); }
});

router.post('/operadores/cerrar', authMiddleware, async (req, res, next) => {
  try {
    if (req.user.operador_activo) await UsuarioService.logout(req.user.jti);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/**
 * GET /api/auth/me
 * Retorna los datos del usuario autenticado.
 */
router.get('/me', authMiddleware, tenantMiddleware, async (req, res, next) => {
  try {
    const { rows } = await req.dbClient.query(
      `SELECT id, nombre, documento, email, rol, parqueadero_id
       FROM usuarios WHERE id = $1 AND parqueadero_id = $2`,
      [req.user.id, req.parqueaderoId]
    );
    res.json({ success: true, usuario: rows[0] || req.user });
  } catch (err) { next(err); }
});

/** Datos personales del operador. El documento no se modifica por este flujo:
 * es su identificador de acceso y requiere un proceso administrativo aparte. */
router.patch('/me',
  authMiddleware,
  tenantMiddleware,
  validateBody({ nombre: [required('Nombre requerido'), minLen(2, 'Nombre muy corto')], email: [isEmail('Correo inválido')] }),
  async (req, res, next) => {
    try {
      const { rows } = await req.dbClient.query(
        `UPDATE usuarios SET nombre = $1, email = $2
         WHERE id = $3 AND parqueadero_id = $4
         RETURNING id, nombre, documento, email, rol, parqueadero_id`,
        [String(req.body.nombre).trim(), req.body.email ? String(req.body.email).trim() : null, req.user.id, req.parqueaderoId]
      );
      res.json({ success: true, usuario: rows[0] });
    } catch (err) { next(err); }
  }
);

module.exports = router;
