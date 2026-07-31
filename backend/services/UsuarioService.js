'use strict';

const jwt        = require('jsonwebtoken');
const { withAuthContext }  = require('../db/pool');
const Usuario    = require('../models/Usuario');
const Parqueadero = require('../models/Parqueadero');
const { comparePassword, generateJti } = require('../utils/crypto');
const {
  UnauthorizedError,
  NotFoundError,
  ValidationError,
} = require('../utils/errors');

const JWT_SECRET  = process.env.JWT_SECRET  || 'CAMBIAR_EN_PRODUCCION';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

/**
 * ══════════════════════════════════════════════════════════════
 * SERVICIO DE AUTENTICACIÓN — AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 *
 * Opera ANTES de que exista sesión → no usa tenantMiddleware.
 */
class UsuarioService {
  /**
   * Login: identifica el tenant a partir de un documento único y emite JWT.
   *
   * @param {string} documento         - Documento de identidad del usuario
   * @param {string} password          - Contraseña en texto plano
   * @param {object} meta              - { ip, userAgent } para auditoría
   */
  static async login(documento, password, meta = {}) {
    return withAuthContext(async (client) => {
    // El documento es único en todo el sistema. Así no se expone ni se pide
    // el identificador del parqueadero en la pantalla de inicio de sesión.
    const { rows: userRows } = await client.query(
      `SELECT u.id, u.parqueadero_id, u.nombre, u.documento, u.password_hash, u.rol, u.activo,
              p.nombre AS parqueadero_nombre, p.codigo AS parqueadero_codigo, p.activo AS parqueadero_activo
       FROM usuarios u
       JOIN parqueaderos p ON p.id = u.parqueadero_id
       WHERE u.documento = $1`,
      [documento]
    );
    const usuario = userRows[0];

    if (!usuario) throw new UnauthorizedError('Usuario o contraseña incorrectos');
    if (!usuario.parqueadero_activo) throw new UnauthorizedError('El parqueadero está desactivado. Contacte al administrador.');
    if (!usuario.activo) throw new UnauthorizedError('Usuario desactivado. Contacte al administrador.');

    // 3. Verificar contraseña con bcrypt
    const ok = await comparePassword(password, usuario.password_hash);
    if (!ok) throw new UnauthorizedError('Usuario o contraseña incorrectos');

    // 4. Generar JWT con parqueadero_id y jti para revocación
    const jti = generateJti();

    const token = jwt.sign(
      {
        sub           : usuario.id,
        parqueadero_id: usuario.parqueadero_id,
        rol           : usuario.rol,
        nombre        : usuario.nombre,
        jti,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    const { exp } = jwt.decode(token);
    const expDate = new Date(exp * 1000);

    // 5. Registrar sesión en DB para permitir revocación
    await client.query(
      `INSERT INTO sesiones_jwt (usuario_id, parqueadero_id, jti, expira_en, ip_origen, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [usuario.id, usuario.parqueadero_id, jti, expDate, meta.ip || null, meta.userAgent || null]
    );

    // 6. Actualizar último acceso
    await client.query(
      `UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1`,
      [usuario.id]
    );

    return {
      token,
      expira_en: expDate.toISOString(),
      usuario: {
        id            : usuario.id,
        nombre        : usuario.nombre,
        documento     : usuario.documento,
        rol           : usuario.rol,
        parqueadero_id: usuario.parqueadero_id,
        parqueadero   : usuario.parqueadero_nombre,
        codigo_parqueadero: usuario.parqueadero_codigo,
      },
    };
    });
  }

  /**
   * Logout: revocar el token del usuario actual.
   */
  static async logout(jti) {
    await withAuthContext((client) => client.query(
      `UPDATE sesiones_jwt SET revocado = TRUE WHERE jti = $1`,
      [jti]
    ));
  }

  /**
   * Verificar si un token específico está activo.
   */
  static async verifyToken(jti) {
    const { rows } = await withAuthContext((client) => client.query(
      `SELECT id FROM sesiones_jwt
       WHERE jti = $1 AND revocado = FALSE AND expira_en > NOW()`,
      [jti]
    ));
    return rows.length > 0;
  }
}

module.exports = UsuarioService;
