'use strict';

/**
 * ══════════════════════════════════════════════════════════════
 * MODELO USUARIO — AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 *
 * Todas las queries incluyen parqueadero_id explícitamente
 * (triple seguridad: middleware → RLS → query explícita).
 */
class Usuario {
  /**
   * Buscar usuario por parqueadero_id + documento (para login).
   * Esta query se ejecuta SIN contexto RLS (antes de autenticar).
   */
  static async findByParqueaderoAndDocumento(client, parqueaderoId, documento) {
    const { rows } = await client.query(
      `SELECT id, parqueadero_id, nombre, documento, email, password_hash, rol, activo, ultimo_acceso
       FROM usuarios
       WHERE parqueadero_id = $1 AND documento = $2`,
      [parqueaderoId, documento]
    );
    return rows[0] || null;
  }

  /**
   * Buscar usuario por ID dentro de un parqueadero.
   */
  static async findById(client, parqueaderoId, id) {
    const { rows } = await client.query(
      `SELECT id, parqueadero_id, nombre, documento, email, rol, activo, ultimo_acceso,
              creado_en, actualizado_en
       FROM usuarios
       WHERE id = $1 AND parqueadero_id = $2`,
      [id, parqueaderoId]
    );
    return rows[0] || null;
  }

  /**
   * Listar todos los usuarios de un parqueadero.
   */
  static async findAll(client, parqueaderoId, { soloActivos = false } = {}) {
    let sql = `
      SELECT id, parqueadero_id, nombre, documento, email, rol, activo, ultimo_acceso,
             creado_en, actualizado_en
      FROM usuarios
      WHERE parqueadero_id = $1`;
    if (soloActivos) sql += ` AND activo = TRUE`;
    sql += ` ORDER BY nombre ASC`;
    const { rows } = await client.query(sql, [parqueaderoId]);
    return rows;
  }

  /**
   * Listado global para el SUPERADMIN. Se ejecuta con contexto interno de
   * autenticacion, nunca con datos aportados por el navegador.
   */
  static async findAllForSuperadmin(client) {
    const { rows } = await client.query(`
      SELECT u.id, u.parqueadero_id, u.nombre, u.documento, u.email, u.rol,
             u.activo, u.ultimo_acceso, u.creado_en, u.actualizado_en,
             p.codigo AS parqueadero_codigo, p.nombre AS parqueadero_nombre
      FROM usuarios u
      JOIN parqueaderos p ON p.id = u.parqueadero_id
      ORDER BY u.creado_en DESC, u.nombre ASC
    `);
    return rows;
  }

  /**
   * Crear nuevo usuario en un parqueadero.
   */
  static async create(client, parqueaderoId, data) {
    const { nombre, documento, email = null, password_hash, rol = 'OPERADOR' } = data;
    const { rows } = await client.query(
      `INSERT INTO usuarios (parqueadero_id, nombre, documento, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, parqueadero_id, nombre, documento, email, rol, activo, creado_en`,
      [parqueaderoId, nombre, documento, email, password_hash, rol]
    );
    return rows[0];
  }

  /**
   * Actualizar datos de un usuario (dentro del mismo parqueadero).
   */
  static async update(client, parqueaderoId, id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = ['nombre', 'email', 'rol', 'activo', 'password_hash'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (!fields.length) return this.findById(client, parqueaderoId, id);

    values.push(id, parqueaderoId);
    const { rows } = await client.query(
      `UPDATE usuarios SET ${fields.join(', ')}
       WHERE id = $${idx} AND parqueadero_id = $${idx + 1}
       RETURNING id, parqueadero_id, nombre, documento, email, rol, activo, actualizado_en`,
      values
    );
    return rows[0] || null;
  }

  /** Actualiza una cuenta de cualquier tenant, solo para SUPERADMIN. */
  static async updateAny(client, id, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    const allowed = ['nombre', 'email', 'rol', 'activo', 'password_hash'];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (!fields.length) return null;

    values.push(id);
    const { rows } = await client.query(
      `UPDATE usuarios SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, parqueadero_id, nombre, documento, email, rol, activo, actualizado_en`,
      values
    );
    return rows[0] || null;
  }

  /**
   * Actualizar timestamp de último acceso.
   */
  static async updateLastAccess(client, id) {
    await client.query(
      `UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1`,
      [id]
    );
  }

  /**
   * Desactivar un usuario — soft delete.
   */
  static async deactivate(client, parqueaderoId, id) {
    const { rows } = await client.query(
      `UPDATE usuarios SET activo = FALSE
       WHERE id = $1 AND parqueadero_id = $2
       RETURNING id`,
      [id, parqueaderoId]
    );
    return rows[0] || null;
  }

  /** Desactiva una cuenta de cualquier tenant, solo para SUPERADMIN. */
  static async deactivateAny(client, id) {
    const { rows } = await client.query(
      `UPDATE usuarios SET activo = FALSE WHERE id = $1 RETURNING id, parqueadero_id`,
      [id]
    );
    return rows[0] || null;
  }
}

module.exports = Usuario;
