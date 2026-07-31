'use strict';

const bcrypt        = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

/**
 * Genera un hash bcrypt de una contraseña en texto plano.
 * @param {string} plainText
 * @returns {Promise<string>}
 */
async function hashPassword(plainText) {
  return bcrypt.hash(plainText, ROUNDS);
}

/**
 * Compara una contraseña en texto plano con su hash almacenado.
 * @param {string} plainText
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function comparePassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

/**
 * Genera un UUID v4 único (usado como JTI en JWT).
 * @returns {string}
 */
function generateJti() {
  return uuidv4();
}

/**
 * Normaliza texto para comparaciones: minúsculas, sin tildes, sin espacios extra.
 * @param {string} str
 * @returns {string}
 */
function normalizeText(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

module.exports = { hashPassword, comparePassword, generateJti, normalizeText };
