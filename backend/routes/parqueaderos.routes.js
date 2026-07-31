'use strict';

const router              = require('express').Router();
const Parqueadero         = require('../models/Parqueadero');
const Usuario             = require('../models/Usuario');
const { hashPassword }    = require('../utils/crypto');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { query, pool }     = require('../db/pool');
const {
  validateBody, required, minLen, maxLen, isEmail, securePassword,
} = require('../middleware/validate');
const {
  NotFoundError, ConflictError, ValidationError,
} = require('../utils/errors');

/**
 * ── GET /api/parqueaderos  — Listar todos (solo SUPERADMIN) ──────────────────
 * No requiere tenantMiddleware porque el SUPERADMIN ve todos los parqueaderos.
 */
router.get('/', authMiddleware, requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    const client = req; // usamos pool directo
    const { rows: parqueaderos } = await query(
      `SELECT id, codigo, nombre, nit, ciudad, activo, plan, creado_en
       FROM parqueaderos ORDER BY nombre ASC`
    );
    res.json({ success: true, parqueaderos });
  } catch (err) {
    next(err);
  }
});

/**
 * ── POST /api/parqueaderos  — Crear parqueadero + ADMIN inicial (solo SUPERADMIN) ──
 * Crea el tenant y su primer usuario ADMIN en una transacción.
 */
router.post('/',
  authMiddleware,
  requireRole('SUPERADMIN'),
  validateBody({
    codigo         : [required('Código de parqueadero requerido'), minLen(3, 'Mínimo 3 caracteres'), maxLen(30, 'Máximo 30 caracteres')],
    nombre         : [required('Nombre del parqueadero requerido'), minLen(3, 'Nombre muy corto')],
    admin_documento: [required('Documento del administrador requerido'), minLen(5, 'Mínimo 5 dígitos')],
    admin_nombre   : [required('Nombre del administrador requerido'), minLen(2, 'Nombre muy corto')],
    admin_email    : [isEmail('Correo electrónico del administrador inválido')],
    admin_password : [required('Contraseña del administrador requerida'), securePassword()],
  }),
  async (req, res, next) => {
    try {
      const {
        codigo, nombre, nit, direccion, ciudad, departamento,
        telefono, email, plan,
        admin_documento, admin_nombre, admin_email, admin_password,
      } = req.body;

      if (!/^[A-Z0-9_-]{3,30}$/.test(codigo.toUpperCase().trim())) {
        throw new ValidationError('El código del parqueadero solo puede usar letras, números, guion y guion bajo');
      }

      // Verificar código único
      const { rows: existing } = await query(
        `SELECT id FROM parqueaderos WHERE codigo = $1`,
        [codigo.toUpperCase().trim()]
      );
      if (existing.length) {
        throw new ConflictError(`Ya existe un parqueadero con el código ${codigo.toUpperCase()}`);
      }

      // Validar documento numérico
      if (!/^\d+$/.test(admin_documento)) {
        throw new ValidationError('El documento del administrador debe contener solo números');
      }

      // Crear parqueadero + usuario ADMIN en una transacción
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.request_context', 'system', true)");

        // 1. Crear parqueadero (tenant)
        const { rows: parkRows } = await client.query(
          `INSERT INTO parqueaderos (codigo, nombre, nit, direccion, ciudad, departamento, telefono, email, plan)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, codigo, nombre, activo, plan, creado_en`,
          [
            codigo.toUpperCase().trim(), nombre, nit || null,
            direccion || null, ciudad || null, departamento || null,
            telefono || null, email || null, plan || 'BASICO',
          ]
        );
        const parqueadero = parkRows[0];

        // 2. Crear usuario ADMIN del parqueadero
        const password_hash = await hashPassword(admin_password);
        const { rows: userRows } = await client.query(
          `INSERT INTO usuarios (parqueadero_id, nombre, documento, email, password_hash, rol)
           VALUES ($1, $2, $3, $4, $5, 'ADMIN')
           RETURNING id, nombre, documento, email, rol, creado_en`,
          [parqueadero.id, admin_nombre, admin_documento, admin_email || null, password_hash]
        );

        await client.query('COMMIT');

        res.status(201).json({
          success: true,
          parqueadero,
          admin: userRows[0],
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ── GET /api/parqueaderos/:id  — Ver mi parqueadero ──────────────────────────
 * Un ADMIN ve solo su propio parqueadero. SUPERADMIN puede ver cualquiera.
 */
router.get('/:id',
  authMiddleware,
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req, res, next) => {
    try {
      // ADMIN solo puede ver su propio parqueadero
      if (req.user.rol === 'ADMIN' && req.params.id !== req.user.parqueadero_id) {
        throw new NotFoundError('Parqueadero');
      }

      const { rows } = await query(
        `SELECT id, codigo, nombre, nit, direccion, ciudad, departamento,
                telefono, email, logo_url, activo, plan, creado_en, actualizado_en
         FROM parqueaderos WHERE id = $1`,
        [req.params.id]
      );
      if (!rows[0]) throw new NotFoundError('Parqueadero');
      res.json({ success: true, parqueadero: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * ── PATCH /api/parqueaderos/:id  — Actualizar mi parqueadero ─────────────────
 * ADMIN puede actualizar solo su parqueadero. SUPERADMIN puede actualizar cualquiera.
 */
router.patch('/:id',
  authMiddleware,
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req, res, next) => {
    try {
      // ADMIN solo puede actualizar su propio parqueadero
      if (req.user.rol === 'ADMIN' && req.params.id !== req.user.parqueadero_id) {
        throw new NotFoundError('Parqueadero');
      }

      const allowed = ['nombre', 'nit', 'direccion', 'ciudad', 'departamento', 'telefono', 'email', 'logo_url'];
      const fields  = [];
      const values  = [];
      let idx = 1;

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = $${idx++}`);
          values.push(req.body[key]);
        }
      }

      if (!fields.length) {
        const { rows } = await query(`SELECT * FROM parqueaderos WHERE id = $1`, [req.params.id]);
        return res.json({ success: true, parqueadero: rows[0] || null });
      }

      values.push(req.params.id);
      const { rows } = await query(
        `UPDATE parqueaderos SET ${fields.join(', ')} WHERE id = $${idx}
         RETURNING id, codigo, nombre, nit, ciudad, activo, plan, actualizado_en`,
        values
      );
      if (!rows[0]) throw new NotFoundError('Parqueadero');
      res.json({ success: true, parqueadero: rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
