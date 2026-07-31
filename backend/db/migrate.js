'use strict';

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

/**
 * ══════════════════════════════════════════════════════════════
 * RUNNER DE MIGRACIONES — AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 *
 * Ejecuta las migraciones SQL en orden ascendente.
 * Registra cada migración ejecutada en migrations_log para
 * no volver a ejecutarlas en corridas posteriores.
 *
 * Uso: node db/migrate.js
 *
 * NOTA: Este script usa el usuario superadmin de la DB porque
 *       necesita crear roles y habilitar RLS (requiere privilegios
 *       de superusuario en PostgreSQL).
 */

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Pool con usuario superadmin para las migraciones
const pool = new Pool({
  host    : process.env.DB_HOST        || 'localhost',
  port    : Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME        || 'mpt_parking',
  user    : process.env.DB_SUPERUSER   || 'postgres',
  password: process.env.DB_SUPERPASSWORD || '',
  ssl     : false,
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log('\n🚀 AMC My Parking Turn — Sistema de Migraciones\n');

    // Crear tabla de control si no existe (bootstrap)
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id           SERIAL       PRIMARY KEY,
        filename     VARCHAR(100) NOT NULL UNIQUE,
        ejecutado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Obtener migraciones ya ejecutadas
    const { rows: executed } = await client.query(
      'SELECT filename FROM migrations_log ORDER BY filename'
    );
    const executedSet = new Set(executed.map((r) => r.filename));

    // Leer y ordenar archivos de migraciones
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (executedSet.has(file)) {
        console.log(`   ✅ ${file} — ya ejecutada`);
        continue;
      }

      console.log(`   ⏳ Ejecutando ${file}...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`   ✅ ${file} — completada`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`   ❌ ${file} — ERROR: ${err.message}`);
        throw err;
      }
    }

    if (ran === 0) {
      console.log('\n   📋 No hay migraciones pendientes.\n');
    } else {
      console.log(`\n   🎉 ${ran} migración(es) ejecutada(s) exitosamente.\n`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('\n[migrate] Error fatal:', err.message);
  process.exit(1);
});
