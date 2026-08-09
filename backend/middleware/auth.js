'use strict';

const jwt = require('jsonwebtoken');
const { withAuthContext } = require('../db/pool');
const { UnauthorizedError } = require('../utils/errors');

const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIAR_EN_PRODUCCION';

/**
 * ══════════════════════════════════════════════════════════════
 * MIDDLEWARE DE AUTENTICACIÓN JWT — AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 *
 * 1. Lee el token del header Authorization: Bearer <token>
 * 2. Verifica la firma y vigencia del JWT
 * 3. Comprueba que el token no esté revocado en sesiones_jwt
 * 4. Adjunta req.user = { id, parqueadero_id, rol, jti, nombre }
 *
 * IMPORTANTE: Este middleware NO setea el contexto RLS.
 *             El tenantMiddleware hace eso en la siguiente capa.
 */
async function authMiddleware(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Token de autorización requerido');
    }

    const token = header.slice(7).trim();
    if (!token) throw new UnauthorizedError('Token vacío');

    // Verificar firma y expiración
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new UnauthorizedError('Sesión expirada. Inicie sesión nuevamente.');
      }
      throw new UnauthorizedError('Token inválido');
    }

    // Verificar que el token no haya sido revocado
    const { rows } = await withAuthContext((client) => client.query(
      `SELECT id FROM sesiones_jwt
       WHERE jti = $1 AND revocado = FALSE AND expira_en > NOW()`,
      [payload.jti]
    ));
    if (!rows.length) {
      throw new UnauthorizedError('Sesión inválida o revocada. Inicie sesión nuevamente.');
    }

    // Adjuntar contexto del usuario al request
    req.user = {
      id            : payload.sub,
      parqueadero_id: payload.parqueadero_id,
      rol           : payload.rol,
      jti           : payload.jti,
      nombre        : payload.nombre,
      operador_activo: payload.operador_activo === true,
      operador_id    : payload.operador_id || null,
      operador_nombre: payload.operador_nombre || null,
      operador_tipo  : payload.operador_tipo || null,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware de autorización por rol.
 * Uso: router.delete('/:id', authMiddleware, requireRole('ADMIN'), handler)
 *
 * @param {...string} roles - roles permitidos (SUPERADMIN | ADMIN | OPERADOR)
 */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('No autenticado'));
    }
    if (!roles.includes(req.user.rol)) {
      return next({
        isOperational: true,
        statusCode: 403,
        code: 'FORBIDDEN',
        message: `Rol requerido: ${roles.join(' o ')}. Su rol actual es: ${req.user.rol}`,
      });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
