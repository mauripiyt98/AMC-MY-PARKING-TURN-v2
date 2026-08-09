'use strict';

const router         = require('express').Router();
const UsuarioService = require('../services/UsuarioService');
const { validateBody, required, minLen, isEmail } = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

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
