'use strict';

const { pool } = require('../db/pool');
const { UnauthorizedError } = require('../utils/errors');

/**
 * ══════════════════════════════════════════════════════════════
 * MIDDLEWARE DE CONTEXTO MULTI-TENANT  ← EL NÚCLEO DEL SISTEMA
 * AMC My Parking Turn v2
 * ══════════════════════════════════════════════════════════════
 *
 * Se ejecuta en CADA petición autenticada, después de authMiddleware.
 *
 * Responsabilidades:
 *  1. Leer parqueadero_id del JWT ya verificado (req.user.parqueadero_id)
 *  2. Obtener una conexión dedicada del pool
 *  3. Inyectar el parqueadero_id en la sesión PostgreSQL via SET LOCAL
 *     → Esto activa automáticamente las políticas RLS de PostgreSQL
 *  4. Adjuntar req.dbClient para que los servicios lo reusen
 *  5. Liberar la conexión al terminar la respuesta
 *
 * Seguridad en capas:
 *  Layer 1 → Este middleware garantiza que parqueadero_id siempre
 *             esté presente en todas las queries del request.
 *  Layer 2 → Las políticas RLS de PostgreSQL filtran por parqueadero_id
 *             a nivel de motor, incluso si Layer 1 fallara.
 *  Layer 3 → Los modelos incluyen parqueadero_id explícitamente
 *             en cada query como validación adicional.
 *
 * @requires authMiddleware (debe ejecutarse antes)
 */
async function tenantMiddleware(req, res, next) {
  if (!req.user || !req.user.parqueadero_id) {
    return next(new UnauthorizedError('Contexto de parqueadero no establecido en el token'));
  }

  const parqueaderoId = req.user.parqueadero_id;

  // Validar formato UUID básico antes de enviarlo a la DB
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(parqueaderoId)) {
    return next(new UnauthorizedError('parqueadero_id inválido en token'));
  }

  let client;
  try {
    // Obtener conexión del pool
    client = await pool.connect();

    // Iniciar transacción para que SET LOCAL tenga efecto en toda la request
    await client.query('BEGIN');

    // ── INYECCIÓN DEL CONTEXTO DE TENANT ──────────────────────────────────
    // SET LOCAL solo dura hasta el fin de la transacción actual.
    // Cualquier query posterior en esta conexión verá app.parqueadero_id seteado.
    // Las políticas RLS de PostgreSQL llaman a current_parqueadero_id() que lee
    // este valor y filtra automáticamente todas las queries.
    await client.query(`SET LOCAL app.parqueadero_id = $1`, [parqueaderoId]);

    // Adjuntar el cliente y parqueadero_id al request para los controladores
    req.dbClient      = client;
    req.parqueaderoId = parqueaderoId;

    // Liberar conexión y hacer commit al terminar la respuesta
    const release = () => {
      if (client) {
        client.query('COMMIT').catch(() => {}).finally(() => {
          client.release();
          client = null;
        });
      }
    };

    // Rollback si la respuesta terminó con error
    const rollback = () => {
      if (client) {
        client.query('ROLLBACK').catch(() => {}).finally(() => {
          client.release();
          client = null;
        });
      }
    };

    res.on('finish', () => {
      if (res.statusCode >= 400) rollback();
      else release();
    });

    res.on('close', () => {
      if (!res.writableEnded) rollback();
    });

    next();
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    next(err);
  }
}

module.exports = { tenantMiddleware };
