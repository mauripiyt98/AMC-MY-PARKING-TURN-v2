'use strict';

/**
 * ══════════════════════════════════════════════════════════════
 * MODELO PARQUEADERO — AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 *
 * El parqueadero es el "tenant root": cada fila es un parqueadero
 * cliente completamente independiente del resto.
 *
 * Las operaciones de parqueadero NO requieren filtro RLS propio
 * porque la validación de parqueadero_id se hace explícitamente
 * en la capa de servicio.
 */
class Parqueadero {
  /**
   * Obtener un parqueadero por ID (UUID).
   */
  static async findById(client, id) {
    const { rows } = await client.query(
      `SELECT id, codigo, nombre, nit, direccion, ciudad, departamento,
              telefono, email, logo_url, activo, plan, creado_en, actualizado_en
       FROM parqueaderos
       WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Obtener un parqueadero por su código de acceso (para login).
   * Esta query se ejecuta SIN contexto RLS (antes de autenticar).
   */
  static async findByCodigo(client, codigo) {
    const { rows } = await client.query(
      `SELECT id, codigo, nombre, nit, activo, plan
       FROM parqueaderos
       WHERE codigo = $1`,
      [codigo.toUpperCase().trim()]
    );
    return rows[0] || null;
  }

  /**
   * Listar todos los parqueaderos (solo SUPERADMIN).
   */
  static async findAll(client, { soloActivos = false } = {}) {
    let sql = `
      SELECT id, codigo, nombre, nit, ciudad, activo, plan, creado_en
      FROM parqueaderos`;
    if (soloActivos) sql += ` WHERE activo = TRUE`;
    sql += ` ORDER BY nombre ASC`;
    const { rows } = await client.query(sql);
    return rows;
  }

  /**
   * Crear un nuevo parqueadero (tenant).
   * Se ejecuta con el superadmin de la DB o desde el seed.
   */
  static async create(client, data) {
    const {
      codigo, nombre, nit = null,
      direccion = null, ciudad = null, departamento = null,
      telefono = null, email = null, logo_url = null,
      plan = 'BASICO',
    } = data;

    const { rows } = await client.query(
      `INSERT INTO parqueaderos (codigo, nombre, nit, direccion, ciudad, departamento, telefono, email, logo_url, plan)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, codigo, nombre, nit, ciudad, activo, plan, creado_en`,
      [
        codigo.toUpperCase().trim(), nombre, nit,
        direccion, ciudad, departamento,
        telefono, email, logo_url, plan,
      ]
    );
    return rows[0];
  }

  /**
   * Actualizar datos de un parqueadero.
   * Solo puede actualizar su propio parqueadero (validado por el servicio).
   */
  static async update(client, id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    const allowed = [
      'nombre', 'nit', 'direccion', 'ciudad', 'departamento',
      'telefono', 'email', 'logo_url', 'plan', 'activo',
    ];

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }

    if (!fields.length) return this.findById(client, id);

    values.push(id);
    const { rows } = await client.query(
      `UPDATE parqueaderos SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING id, codigo, nombre, nit, ciudad, activo, plan, actualizado_en`,
      values
    );
    return rows[0] || null;
  }
}

module.exports = Parqueadero;
