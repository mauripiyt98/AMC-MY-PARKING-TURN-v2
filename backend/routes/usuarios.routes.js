'use strict';

const router              = require('express').Router();
const Usuario             = require('../models/Usuario');
const { withAuthContext } = require('../db/pool');
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
router.get('/', requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    // El desarrollador administra todos los parqueaderos. Su token pertenece
    // a un tenant tecnico, por eso este listado usa el contexto interno RLS.
    if (req.user.rol === 'SUPERADMIN') {
      const usuarios = await withAuthContext((client) => Usuario.findAllForSuperadmin(client));
      return res.json({ success: true, usuarios });
    }
    const soloActivos = req.query.activos === 'true';
    const usuarios = await Usuario.findAll(req.dbClient, req.parqueaderoId, { soloActivos });
    res.json({ success: true, usuarios });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/usuarios/:id  — Obtener usuario por ID ──────────────────────────
router.get('/:id', requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.dbClient, req.parqueaderoId, req.params.id);
    if (!usuario) throw new NotFoundError('Usuario');
    res.json({ success: true, usuario });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/usuarios  — Crear usuario independiente (solo SUPERADMIN) ──────
router.post('/',
  requireRole('SUPERADMIN'),
  validateBody({
    nombre  : [required('Nombre requerido'), minLen(2, 'Nombre muy corto'), maxLen(150, 'Nombre muy largo')],
    documento: [required('Documento requerido'), minLen(5, 'Documento mínimo 5 dígitos'), maxLen(20, 'Documento muy largo')],
    email    : [isEmail('Correo electrónico inválido')],
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
      const rolesPermitidos = ['ADMIN', 'OPERADOR'];
      if (!rolesPermitidos.includes(rol.toUpperCase())) {
        throw new ValidationError(`Rol inválido. Permitidos: ${rolesPermitidos.join(', ')}`);
      }

      // El documento es único globalmente porque el login no solicita tenant.
      const { rows } = await withAuthContext((client) => client.query(
        `SELECT id FROM usuarios WHERE documento = $1`,
        [documento]
      ));
      if (rows.length) {
        throw new ConflictError(`Ya existe un usuario con el documento ${documento}`);
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
  requireRole('SUPERADMIN'),
  async (req, res, next) => {
    try {
      const { nombre, email, rol, activo, password } = req.body;
      const updates = {};

      if (nombre !== undefined) updates.nombre = nombre;
      if (email  !== undefined) updates.email  = email;
      if (activo !== undefined) updates.activo = activo;

      // Cambio de rol — validar permisos
      if (rol !== undefined) {
        const rolesPermitidos = ['ADMIN', 'OPERADOR'];
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

      if (updates.activo === false && req.params.id === String(req.user.id)) {
        throw new ValidationError('No puedes desactivar tu propio usuario');
      }

      const usuario = req.user.rol === 'SUPERADMIN'
        ? await withAuthContext((client) => Usuario.updateAny(client, req.params.id, updates))
        : await Usuario.update(req.dbClient, req.parqueaderoId, req.params.id, updates);
      if (!usuario) throw new NotFoundError('Usuario');
      if (updates.activo === false) {
        const revokeSessions = (client) => client.query(
          'UPDATE sesiones_jwt SET revocado = TRUE WHERE usuario_id = $1 AND parqueadero_id = $2',
          [usuario.id, usuario.parqueadero_id]
        );
        if (req.user.rol === 'SUPERADMIN') await withAuthContext(revokeSessions);
        else await revokeSessions(req.dbClient);
      }
      res.json({ success: true, usuario });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/usuarios/:id  — Desactivar usuario (soft delete) ──────────────
router.delete('/:id', requireRole('SUPERADMIN'), async (req, res, next) => {
  try {
    // Evitar que el admin se elimine a sí mismo
    if (req.params.id === String(req.user.id)) {
      throw new ValidationError('No puedes desactivar tu propio usuario');
    }
    const usuario = req.user.rol === 'SUPERADMIN'
      ? await withAuthContext((client) => Usuario.deactivateAny(client, req.params.id))
      : await Usuario.deactivate(req.dbClient, req.parqueaderoId, req.params.id);
    if (!usuario) throw new NotFoundError('Usuario');
    const revokeSessions = (client) => client.query(
      'UPDATE sesiones_jwt SET revocado = TRUE WHERE usuario_id = $1 AND parqueadero_id = $2',
      [usuario.id, usuario.parqueadero_id]
    );
    if (req.user.rol === 'SUPERADMIN') await withAuthContext(revokeSessions);
    else await revokeSessions(req.dbClient);
    res.json({ success: true, message: 'Usuario desactivado correctamente' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
