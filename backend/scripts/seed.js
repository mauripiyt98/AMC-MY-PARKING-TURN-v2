'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { hashPassword } = require('../utils/crypto');

/**
 * ══════════════════════════════════════════════════════════════
 * SEED INICIAL — AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 *
 * Crea el parqueadero inicial del desarrollador y el usuario SUPERADMIN.
 * Se ejecuta UNA SOLA VEZ después de las migraciones.
 *
 * Uso: node scripts/seed.js
 *
 * Credenciales se configuran en .env con las variables SEED_*
 */

// Pool con superadmin para el seed (necesita bypassear RLS)
const pool = new Pool({
  host    : process.env.DB_HOST          || 'localhost',
  port    : Number(process.env.DB_PORT)   || 5432,
  database: process.env.DB_NAME          || 'mpt_parking',
  user    : process.env.DB_SUPERUSER     || 'postgres',
  password: process.env.DB_SUPERPASSWORD || '',
  ssl     : false,
});

const PARQUEADERO = {
  codigo    : process.env.SEED_PARQUEADERO_CODIGO || 'PARK001',
  nombre    : process.env.SEED_PARQUEADERO_NOMBRE || 'My Parking Turn - Desarrollo',
  nit       : process.env.SEED_PARQUEADERO_NIT    || null,
};

const ADMIN = {
  documento : process.env.SEED_ADMIN_DOCUMENTO || '1110591592',
  nombre    : process.env.SEED_ADMIN_NOMBRE    || 'USUARIO DESARROLLADOR',
  email     : process.env.SEED_ADMIN_EMAIL     || 'dev@mpt.com',
  password  : process.env.SEED_ADMIN_PASSWORD  || 'Dev@12345',
};

async function seed() {
  const client = await pool.connect();
  console.log('\n🌱 AMC My Parking Turn — Seed inicial\n');

  try {
    await client.query('BEGIN');

    // ── Verificar si ya existe ────────────────────────────
    const { rows: existing } = await client.query(
      `SELECT id FROM parqueaderos WHERE codigo = $1`,
      [PARQUEADERO.codigo]
    );

    if (existing.length) {
      console.log(`   ℹ️  El parqueadero "${PARQUEADERO.codigo}" ya existe. Seed omitido.`);
      await client.query('ROLLBACK');
      return;
    }

    // ── 1. Crear parqueadero ──────────────────────────────
    const { rows: parkRows } = await client.query(
      `INSERT INTO parqueaderos (codigo, nombre, nit, plan)
       VALUES ($1, $2, $3, 'BASICO')
       RETURNING id, codigo, nombre`,
      [PARQUEADERO.codigo, PARQUEADERO.nombre, PARQUEADERO.nit]
    );
    const parqueadero = parkRows[0];
    console.log(`   ✅ Parqueadero creado: "${parqueadero.nombre}" (${parqueadero.codigo})`);

    // ── 2. Crear usuario SUPERADMIN ───────────────────────
    const password_hash = await hashPassword(ADMIN.password);
    const { rows: userRows } = await client.query(
      `INSERT INTO usuarios (parqueadero_id, nombre, documento, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5, 'SUPERADMIN')
       RETURNING id, nombre, documento, rol`,
      [parqueadero.id, ADMIN.nombre, ADMIN.documento, ADMIN.email, password_hash]
    );
    const admin = userRows[0];
    console.log(`   ✅ Usuario SUPERADMIN creado: "${admin.nombre}" (doc: ${admin.documento})`);

    await client.query('COMMIT');

    console.log('\n   🎉 Seed completado exitosamente.\n');
    console.log('   ╔════════════════════════════════════════════╗');
    console.log(`  ║  Código parqueadero : ${PARQUEADERO.codigo.padEnd(20)}  ║`);
    console.log(`  ║  Documento usuario  : ${ADMIN.documento.padEnd(20)}  ║`);
    console.log(`  ║  Contraseña         : ${ADMIN.password.padEnd(20)}  ║`);
    console.log('   ╚════════════════════════════════════════════╝\n');
    console.log('   ⚠️  Cambia la contraseña en producción!\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[seed] Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Error fatal:', err.message);
  process.exit(1);
});
