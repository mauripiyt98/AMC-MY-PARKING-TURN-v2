'use strict';

/**
 * ══════════════════════════════════════════════════════════════
 * CLASES DE ERROR PERSONALIZADAS — AMC My Parking Turn
 * ══════════════════════════════════════════════════════════════
 *
 * Permiten al errorHandler distinguir entre errores operacionales
 * (que deben mostrar mensaje al cliente) y errores de programación.
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name          = this.constructor.name;
    this.statusCode    = statusCode;
    this.code          = code;
    this.isOperational = true; // Error esperado del negocio, no un bug
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Recurso') {
    super(`${resource} no encontrado`, 404, 'NOT_FOUND');
  }
}

class ValidationError extends AppError {
  constructor(message, fields = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.fields = fields; // { campo: 'mensaje de error' }
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message = 'El recurso ya existe') {
    super(message, 409, 'CONFLICT');
  }
}

class TenantIsolationError extends AppError {
  constructor() {
    super('Acceso denegado: el recurso no pertenece a su parqueadero', 403, 'TENANT_ISOLATION');
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TenantIsolationError,
};
