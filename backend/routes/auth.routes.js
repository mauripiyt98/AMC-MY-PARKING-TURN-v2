'use strict';

const router         = require('express').Router();
const UsuarioService = require('../services/UsuarioService');
const { validateBody, required, minLen } = require('../middleware/validate');
const { authMiddleware } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Body: { codigo_parqueadero, documento, password }
 */
router.post('/login',
  validateBody({
    codigo_parqueadero: [required('Código de parqueadero requerido'), minLen(3, 'Código inválido')],
    documento         : [required('Documento de usuario requerido')],
    password          : [required('Contraseña requerida')],
  }),
  async (req, res, next) => {
    try {
      const { codigo_parqueadero, documento, password } = req.body;
      const meta = {
        ip       : req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'],
      };
      const result = await UsuarioService.login(codigo_parqueadero, documento, password, meta);
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
router.get('/me', authMiddleware, async (req, res) => {
  res.json({ success: true, usuario: req.user });
});

module.exports = router;
