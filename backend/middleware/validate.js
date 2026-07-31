'use strict';

const { ValidationError } = require('../utils/errors');

/**
 * ══════════════════════════════════════════════════════════════
 * MIDDLEWARE DE VALIDACIÓN DE BODY — AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 */

/**
 * Middleware de validación de body.
 * @param {Object} rules - { campo: [regla1, regla2, ...] }
 */
function validateBody(rules) {
  return (req, _res, next) => {
    const errors = {};

    for (const [field, validators] of Object.entries(rules)) {
      const value = req.body[field];

      for (const validate of validators) {
        const error = validate(value, field);
        if (error) {
          errors[field] = error;
          break; // Primera regla que falla por campo
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      return next(new ValidationError(firstError, errors));
    }

    next();
  };
}

// ── Reglas de validación ─────────────────────────────────────

/** Campo obligatorio */
function required(msg = 'Campo requerido') {
  return (val) => {
    if (val === undefined || val === null || String(val).trim() === '') return msg;
    return null;
  };
}

/** Longitud mínima */
function minLen(min, msg) {
  return (val) => {
    if (val === undefined || val === null) return null;
    if (String(val).trim().length < min) return msg || `Mínimo ${min} caracteres`;
    return null;
  };
}

/** Longitud máxima */
function maxLen(max, msg) {
  return (val) => {
    if (val === undefined || val === null) return null;
    if (String(val).trim().length > max) return msg || `Máximo ${max} caracteres`;
    return null;
  };
}

/** Formato de email */
function isEmail(msg = 'Email inválido') {
  return (val) => {
    if (!val) return null; // email es opcional en varios campos
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(String(val).trim())) return msg;
    return null;
  };
}

/**
 * Contraseña segura:
 * - Mínimo 8 caracteres
 * - Al menos una mayúscula
 * - Al menos un número
 * - Al menos un carácter especial
 */
function securePassword(msg = 'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial') {
  return (val) => {
    if (!val) return null;
    const re = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!re.test(String(val))) return msg;
    return null;
  };
}

module.exports = { validateBody, required, minLen, maxLen, isEmail, securePassword };
