'use strict';

const router              = require('express').Router();
const Usuario             = require('../models/Usuario');
const { hashPassword }    = require('../utils/crypto');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const {
  validateBody, required, minLen, maxLen, isEmail, securePassword,
} = require('../middleware/validate');
const {
  ValidationError, ConflictError, NotFoundError,
} = require('../utils/errors');

// Todas las rutas requieren autenticación + contexto de parqueadero
router.use(authMiddleware, tenantMiddleware);

// ── GET /api/usuarios  — Listar usuarios del parqueadero ──────────────────────
router.get('/', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const soloActivos = req.query.activos === 'true';
    const usuarios = await Usuario.findAll(req.dbClient, req.parqueaderoId, { soloActivos });
    res.json({ success: true, usuarios });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/usuarios/:id  — Obtener usuario por ID ──────────────────────────
router.get('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.dbClient, req.parqueaderoId, req.params.id);
    if (!usuario) throw new NotFoundError('Usuario');
    res.json({ success: true, usuario });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/usuarios  — Crear usuario independiente (solo ADMIN/SUPERADMIN) ─
router.post('/',
  requireRole('ADMIN', 'SUPERADMIN'),
  validateBody({
    nombre  : [required('Nombre requerido'), minLen(2, 'Nombre muy corto'), maxLen(150, 'Nombre muy largo')],
    documento: [required('Documento requerido'), minLen(5, 'Documento mínimo 5 dígitos'), maxLen(20, 'Documento muy largo')],
    password : [required('Contraseña requerida'), securePassword()],
  }),
  async (req, res, next) => {
    try {
      const { nombre, documento, email = null, password, rol = 'OPERADOR' } = req.body;

      // Validar que el documento sea numérico
      if (!/^\d+$/.test(documento)) {
        throw new ValidationError('El documento debe contener solo números');
      }

      // Validar rol permitido
      const rolesPermitidos = req.user.rol === 'SUPERADMIN'
        ? ['SUPERADMIN', 'ADMIN', 'OPERADOR']
        : ['ADMIN', 'OPERADOR'];
      if (!rolesPermitidos.includes(rol.toUpperCase())) {
        throw new ValidationError(`Rol inválido. Permitidos: ${rolesPermitidos.join(', ')}`);
      }

      // Verificar duplicado dentro del parqueadero
      const { rows } = await req.dbClient.query(
        `SELECT id FROM usuarios WHERE parqueadero_id = $1 AND documento = $2`,
        [req.parqueaderoId, documento]
      );
      if (rows.length) {
        throw new ConflictError(`Ya existe un usuario con el documento ${documento} en este parqueadero`);
      }

      const password_hash = await hashPassword(password);
      const usuario = await Usuario.create(req.dbClient, req.parqueaderoId, {
        nombre, documento, email, password_hash, rol: rol.toUpperCase(),
      });

      res.status(201).json({ success: true, usuario });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/usuarios/:id  — Actualizar usuario ────────────────────────────
router.patch('/:id',
  requireRole('ADMIN', 'SUPERADMIN'),
  async (req, res, next) => {
    try {
      const { nombre, email, rol, activo, password } = req.body;
      const updates = {};

      if (nombre !== undefined) updates.nombre = nombre;
      if (email  !== undefined) updates.email  = email;
      if (activo !== undefined) updates.activo = activo;

      // Cambio de rol — validar permisos
      if (rol !== undefined) {
        const rolesPermitidos = req.user.rol === 'SUPERADMIN'
          ? ['SUPERADMIN', 'ADMIN', 'OPERADOR']
          : ['ADMIN', 'OPERADOR'];
        if (!rolesPermitidos.includes(rol.toUpperCase())) {
          throw new ValidationError(`Rol inválido. Permitidos: ${rolesPermitidos.join(', ')}`);
        }
        updates.rol = rol.toUpperCase();
      }

      // Nueva contraseña
      if (password !== undefined && password.length > 0) {
        const re = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
        if (!re.test(password)) {
          throw new ValidationError('La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial');
        }
        updates.password_hash = await hashPassword(password);
      }

      const usuario = await Usuario.update(req.dbClient, req.parqueaderoId, req.params.id, updates);
      if (!usuario) throw new NotFoundError('Usuario');
      res.json({ success: true, usuario });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/usuarios/:id  — Desactivar usuario (soft delete) ──────────────
router.delete('/:id', requireRole('ADMIN', 'SUPERADMIN'), async (req, res, next) => {
  try {
    // Evitar que el admin se elimine a sí mismo
    if (req.params.id === String(req.user.id)) {
      throw new ValidationError('No puedes desactivar tu propio usuario');
    }
    const usuario = await Usuario.deactivate(req.dbClient, req.parqueaderoId, req.params.id);
    if (!usuario) throw new NotFoundError('Usuario');
    res.json({ success: true, message: 'Usuario desactivado correctamente' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
