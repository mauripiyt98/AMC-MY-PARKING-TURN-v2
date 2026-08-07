'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { hashPassword } = require('../utils/crypto');
const { getDbConfig } = require('../db/config');

/*
 * Bootstrap seguro e idempotente del acceso principal.
 *
 * Uso:
 *   1. Configure DB_* y SEED_* en backend/.env.
 *   2. npm run migrate
 *   3. npm run seed
 *
 * El script crea el tenant principal si falta. Si la cuenta principal ya
 * existe en ese tenant, actualiza su perfil, reactiva la cuenta, restablece
 * la clave indicada y revoca las sesiones anteriores.
 */

const pool = new Pool(getDbConfig({ admin: true }));

const PARQUEADERO = {
  codigo: process.env.SEED_PARQUEADERO_CODIGO || 'PARK001',
  nombre: process.env.SEED_PARQUEADERO_NOMBRE || 'My Parking Turn - Desarrollo',
  nit: process.env.SEED_PARQUEADERO_NIT || null,
};

const ADMIN = {
  documento: process.env.SEED_ADMIN_DOCUMENTO || '1110591592',
  nombre: process.env.SEED_ADMIN_NOMBRE || 'USUARIO DESARROLLADOR',
  email: process.env.SEED_ADMIN_EMAIL || 'andresitomao@gmail.com',
  password: process.env.SEED_ADMIN_PASSWORD,
};

async function seed() {
  const client = await pool.connect();

  try {
    if (!ADMIN.password) {
      throw new Error('Falta SEED_ADMIN_PASSWORD en backend/.env.');
    }
    await client.query('BEGIN');
    // En PostgreSQL administrado DATABASE_URL suele ser el propietario de las
    // tablas y FORCE RLS tambien aplica a ese usuario. El seed es una accion
    // interna controlada, por lo que establece el mismo contexto system que
    // usa la API al aprovisionar un parqueadero.
    await client.query("SELECT set_config('app.request_context', 'system', true)");

    const { rows: parks } = await client.query(
      `SELECT id, codigo, nombre
       FROM parqueaderos
       WHERE codigo = $1
       FOR UPDATE`,
      [PARQUEADERO.codigo]
    );

    let parqueadero = parks[0];
    if (!parqueadero) {
      const { rows } = await client.query(
        `INSERT INTO parqueaderos (codigo, nombre, nit, plan)
         VALUES ($1, $2, $3, 'BASICO')
         RETURNING id, codigo, nombre`,
        [PARQUEADERO.codigo, PARQUEADERO.nombre, PARQUEADERO.nit]
      );
      parqueadero = rows[0];
      console.log(`Parqueadero creado: ${parqueadero.codigo}`);
    } else {
      console.log(`Parqueadero recuperado: ${parqueadero.codigo}`);
    }

    const passwordHash = await hashPassword(ADMIN.password);
    const { rows: admins } = await client.query(
      `SELECT id, parqueadero_id
       FROM usuarios
       WHERE documento = $1
       FOR UPDATE`,
      [ADMIN.documento]
    );

    let admin;
    if (admins[0]) {
      if (admins[0].parqueadero_id !== parqueadero.id) {
        throw new Error('El documento principal ya pertenece a otro parqueadero; no se modificó ninguna cuenta.');
      }

      const { rows } = await client.query(
        `UPDATE usuarios
         SET nombre = $1,
             email = $2,
             password_hash = $3,
             rol = 'SUPERADMIN',
             activo = TRUE
         WHERE id = $4
         RETURNING id, nombre, documento, rol`,
        [ADMIN.nombre, ADMIN.email, passwordHash, admins[0].id]
      );
      admin = rows[0];
      await client.query(
        'UPDATE sesiones_jwt SET revocado = TRUE WHERE usuario_id = $1',
        [admin.id]
      );
      console.log(`Acceso SUPERADMIN restablecido: ${admin.documento}`);
    } else {
      const { rows } = await client.query(
        `INSERT INTO usuarios (parqueadero_id, nombre, documento, email, password_hash, rol)
         VALUES ($1, $2, $3, $4, $5, 'SUPERADMIN')
         RETURNING id, nombre, documento, rol`,
        [parqueadero.id, ADMIN.nombre, ADMIN.documento, ADMIN.email, passwordHash]
      );
      admin = rows[0];
      console.log(`Usuario SUPERADMIN creado: ${admin.documento}`);
    }

    await client.query('COMMIT');
    console.log('Seed completado. La contraseña nunca se muestra en consola.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('[seed] Error:', error.message);
  process.exit(1);
});
