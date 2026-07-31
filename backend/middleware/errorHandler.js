'use strict';

/**
 * ══════════════════════════════════════════════════════════════
 * MODELO ERRORHANDLER — Middleware de manejo de errores
 * AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 */

const { AppError } = require('../utils/errors');

/**
 * Handler de errores centralizado.
 * Distingue errores operacionales (AppError → 4xx) de errores de programación (→ 500).
 */
function errorHandler(err, req, res, _next) {
  // Error operacional esperado (ValidationError, NotFoundError, etc.)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      code   : err.code,
      message: err.message,
      ...(err.fields ? { fields: err.fields } : {}),
    });
  }

  // Error de programación o inesperado
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('[ErrorHandler]', err);

  return res.status(500).json({
    success: false,
    code   : 'INTERNAL_ERROR',
    message: isDev ? err.message : 'Error interno del servidor. Por favor intente nuevamente.',
    ...(isDev ? { stack: err.stack } : {}),
  });
}

/**
 * Middleware para rutas no encontradas (404).
 */
function notFound(req, res) {
  res.status(404).json({
    success: false,
    code   : 'NOT_FOUND',
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = { errorHandler, notFound };
