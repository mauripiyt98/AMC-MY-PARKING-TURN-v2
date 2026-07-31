'use strict';

require('dotenv').config();
const { Pool } = require('pg');

/**
 * ══════════════════════════════════════════════════════════════
 * POOL DE CONEXIONES POSTGRESQL — AMC My Parking Turn
 * ══════════════════════════════════════════════════════════════
 *
 * Pool compartido para toda la aplicación.
 * Para mayor escala → añadir PgBouncer en modo transaction pooling.
 */
const pool = new Pool({
  host    : process.env.DB_HOST     || 'localhost',
  port    : Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'mpt_parking',
  user    : process.env.DB_USER     || 'mpt_app',
  password: process.env.DB_PASSWORD || '',
  max     : Number(process.env.DB_MAX_CONNECTIONS)         || 20,
  idleTimeoutMillis      : Number(process.env.DB_IDLE_TIMEOUT_MS)       || 30000,
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 2000,
  ssl     : process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Evitar crash del proceso en errores de conexiones idle
pool.on('error', (err) => {
  console.error('[DB Pool] Error inesperado en cliente idle:', err.message);
});

/**
 * Ejecuta una función dentro de una transacción con contexto de tenant.
 *
 * Inyecta SET LOCAL app.parqueadero_id en la sesión PostgreSQL
 * ANTES de ejecutar cualquier query, activando las políticas RLS.
 *
 * @param {string}   parqueaderoId - UUID del parqueadero (tenant)
 * @param {Function} fn            - async (client) => resultado
 */
async function withTenant(parqueaderoId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Inyectar parqueadero_id en la sesión PostgreSQL → activa RLS
    await client.query("SELECT set_config('app.parqueadero_id', $1, true)", [parqueaderoId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ejecuta una query sin contexto de tenant.
 * Solo para: login (antes de autenticar), crear parqueadero, migraciones.
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Verifica que la conexión a la base de datos funcione.
 */
async function testConnection() {
  const { rows } = await pool.query('SELECT NOW() as now, current_database() as db');
  console.log(`[DB] Conectado a "${rows[0].db}" — ${rows[0].now}`);
  return true;
}

async function withAuthContext(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.request_context', 'auth', true)");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTenant, withAuthContext, query, testConnection };
