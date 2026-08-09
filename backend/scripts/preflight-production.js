'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { getDbConfig } = require('../db/config');

const REQUIRED_RLS_TABLES = ['usuarios', 'sesiones_jwt', 'turnos', 'mensualidades', 'documentos_generados', 'auditoria_eventos'];

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Este chequeo debe ejecutarse con NODE_ENV=production.');
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'CAMBIAR_EN_PRODUCCION') {
    throw new Error('JWT_SECRET no está configurado con un secreto seguro.');
  }
  if (!process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN debe contener el dominio HTTPS público exacto.');
  }
  if (String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() === 'false') {
    throw new Error('DB_SSL_REJECT_UNAUTHORIZED no puede ser false en producción.');
  }

  const pool = new Pool(getDbConfig());
  try {
    const role = await pool.query(`
      SELECT current_user AS name, r.rolsuper, r.rolbypassrls
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    const current = role.rows[0];
    if (!current) throw new Error('No fue posible inspeccionar el rol de base de datos.');
    if (current.rolsuper || current.rolbypassrls) {
      throw new Error(`El rol ${current.name} tiene SUPERUSER o BYPASSRLS; no puede usarse como DATABASE_URL de la aplicación.`);
    }

    const tables = await pool.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class WHERE relname = ANY($1::text[])`, [REQUIRED_RLS_TABLES]
    );
    const found = new Map(tables.rows.map((row) => [row.relname, row]));
    for (const name of REQUIRED_RLS_TABLES) {
      const row = found.get(name);
      if (!row || !row.relrowsecurity || !row.relforcerowsecurity) {
        throw new Error(`RLS no está habilitado y forzado en ${name}. Ejecuta las migraciones antes de publicar.`);
      }
    }

    const audit = await pool.query(`
      SELECT has_table_privilege(current_user, 'auditoria_eventos', 'UPDATE') AS can_update,
             has_table_privilege(current_user, 'auditoria_eventos', 'DELETE') AS can_delete,
             has_table_privilege(current_user, 'auditoria_eventos', 'TRUNCATE') AS can_truncate
    `);
    const permissions = audit.rows[0];
    if (permissions.can_update || permissions.can_delete || permissions.can_truncate) {
      throw new Error('El rol de aplicación tiene privilegios de mutación sobre auditoria_eventos. Revócalos antes de publicar.');
    }

    console.log(`✅ Preflight aprobado: rol ${current.name}, TLS verificado y RLS activo en todas las tablas.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`❌ Preflight de producción falló: ${error.message}`);
  process.exit(1);
});
