'use strict';

const router = require('express').Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');
const { ValidationError, ConflictError, NotFoundError } = require('../utils/errors');

router.use(authMiddleware, tenantMiddleware);

function requireActiveOperator(req, _res, next) {
  if (!req.user.operador_activo) {
    return next(new ValidationError('Debes escoger un operador activo antes de realizar movimientos.'));
  }
  next();
}

function requirePrincipalOperator(req, _res, next) {
  if (!req.user.operador_activo || req.user.operador_tipo !== 'PRINCIPAL') {
    return next(new ValidationError('Esta acciÃ³n requiere activar al operador principal.'));
  }
  next();
}

const PLATE = /^[A-Z0-9]{3,8}$/;
const INTEGER = (value, { min = 0 } = {}) => Number.isInteger(Number(value)) && Number(value) >= min;
const id = (value) => /^[0-9a-f-]{36}$/i.test(String(value || ''));

function normalizePlate(value) {
  const plate = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!PLATE.test(plate)) throw new ValidationError('La placa debe contener entre 3 y 8 caracteres alfanuméricos.');
  return plate;
}

async function audit(req, type, entity, entityId, detail = {}) {
  await req.dbClient.query(
    `INSERT INTO auditoria_eventos (parqueadero_id, usuario_id, tipo, entidad, entidad_id, detalle, ip_origen)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [req.parqueaderoId, req.user.id, type, entity, entityId || null, detail, req.ip || null]
  );
}

async function nextTicket(req, table) {
  // El bloqueo por tenant evita duplicados cuando dos cajas registran a la vez.
  await req.dbClient.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${req.parqueaderoId}:${table}`]);
  const { rows } = await req.dbClient.query(
    `SELECT COALESCE(MAX(ticket_numero), 0) + 1 AS siguiente FROM ${table} WHERE parqueadero_id = $1`,
    [req.parqueaderoId]
  );
  return Number(rows[0].siguiente);
}

function serializeTurn(row) {
  const ingreso = new Date(row.ingreso_en);
  const salida = row.salida_en ? new Date(row.salida_en) : null;
  return {
    id: row.id, ticketNumber: Number(row.ticket_numero), plate: row.placa,
    vehicleType: row.tipo_vehiculo, hourlyPrice: Number(row.tarifa_hora),
    entryIso: ingreso.toISOString(), exitIso: salida?.toISOString(),
    date: new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' }).format(ingreso),
    time: new Intl.DateTimeFormat('es-CO', { timeStyle: 'medium', timeZone: 'America/Bogota' }).format(ingreso),
    entryTime: new Intl.DateTimeFormat('es-CO', { timeStyle: 'medium', timeZone: 'America/Bogota' }).format(ingreso),
    exitTime: salida ? new Intl.DateTimeFormat('es-CO', { timeStyle: 'medium', timeZone: 'America/Bogota' }).format(salida) : null,
    chargedHours: row.horas_cobradas ? Number(row.horas_cobradas) : null,
    totalCharged: row.total_cobrado === null ? null : Number(row.total_cobrado),
    originalTotalCharged: row.total_calculado === null ? null : Number(row.total_calculado),
    user: row.operador_nombre || row.creado_por_nombre,
    operatorName: row.operador_nombre || row.creado_por_nombre,
  };
}

function serializeMonthly(row) {
  return {
    id: row.id, ticketNumber: Number(row.ticket_numero), plate: row.placa,
    // PostgreSQL DATE puede llegar como Date y JSON lo convierte en una fecha-hora
    // ISO. La interfaz trabaja con fechas de calendario (YYYY-MM-DD), no con horas.
    vehicleType: row.tipo_vehiculo, startDate: serializeDate(row.fecha_inicio), expiryDate: serializeDate(row.fecha_vencimiento),
    monthlyRate: Number(row.tarifa_mensual), user: row.creado_por_nombre,
    responsible: row.responsable, document: row.documento, contact: row.contacto, address: row.direccion,
    createdAt: new Date(row.creado_en).toISOString(), closedDate: serializeDate(row.cerrada_en),
    closedReason: row.motivo_cierre,
  };
}

function serializeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function serializeMonthlyCharge(row) {
  return {
    id: row.id, monthlyId: row.mensualidad_id, amount: Number(row.valor), status: row.estado,
    paidAt: row.pagado_en ? new Date(row.pagado_en).toISOString() : null,
  };
}

async function createMonthlyCharge(client, monthly) {
  const { rows } = await client.query(
    `INSERT INTO gestion_cobros_mensualidades (parqueadero_id, mensualidad_id, conductor_id, valor)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [monthly.parqueadero_id, monthly.id, monthly.conductor_id || null, monthly.tarifa_mensual]
  );
  return rows[0];
}

async function upsertMonthlyDriver(client, parqueaderoId, { responsible, document, contact, address }) {
  const { rows } = await client.query(
    `INSERT INTO conductores_mensualidades (parqueadero_id, nombre, documento, contacto, direccion)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (parqueadero_id, documento) WHERE documento IS NOT NULL AND documento <> ''
     DO UPDATE SET nombre = EXCLUDED.nombre, contacto = EXCLUDED.contacto, direccion = EXCLUDED.direccion
     RETURNING id`,
    [parqueaderoId, responsible || 'CONDUCTOR SIN NOMBRE', document || null, contact || null, address || null]
  );
  return rows[0].id;
}

router.get('/estado', async (req, res, next) => {
  try {
    const { rows } = await req.dbClient.query(
      `SELECT * FROM turnos WHERE parqueadero_id = $1 ORDER BY ingreso_en DESC`, [req.parqueaderoId]);
    const monthly = await req.dbClient.query(
      `SELECT * FROM mensualidades WHERE parqueadero_id = $1 ORDER BY creado_en DESC`, [req.parqueaderoId]);
    const monthlyCharges = await req.dbClient.query(
      `SELECT * FROM gestion_cobros_mensualidades WHERE parqueadero_id = $1 ORDER BY creado_en DESC`, [req.parqueaderoId]);
    res.json({ success: true,
      records: rows.filter((r) => r.estado === 'ACTIVO').map(serializeTurn),
      history: rows.filter((r) => r.estado === 'FINALIZADO').map(serializeTurn),
      monthlyRecords: monthly.rows.filter((r) => r.estado === 'ACTIVA').map(serializeMonthly),
      monthlyHistory: monthly.rows.filter((r) => r.estado !== 'ACTIVA').map(serializeMonthly),
      monthlyCharges: monthlyCharges.rows.map(serializeMonthlyCharge),
    });
  } catch (err) { next(err); }
});

router.post('/turnos', requireActiveOperator, async (req, res, next) => {
  try {
    const plate = normalizePlate(req.body.plate);
    if (!INTEGER(req.body.hourlyPrice) || !req.body.vehicleType) {
      throw new ValidationError('Datos del turno incompletos o inválidos.');
    }
    const ingreso = new Date(req.body.entryIso || Date.now());
    if (Number.isNaN(ingreso.getTime())) throw new ValidationError('Fecha de ingreso inválida.');
    const ticket = await nextTicket(req, 'turnos');
    const { rows } = await req.dbClient.query(
      `INSERT INTO turnos (parqueadero_id, ticket_numero, placa, tipo_vehiculo, tarifa_hora, ingreso_en, creado_por_id, creado_por_nombre, operador_id, operador_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.parqueaderoId, ticket, plate, String(req.body.vehicleType).slice(0, 20), Number(req.body.hourlyPrice), ingreso, req.user.id, req.user.nombre, req.user.operador_id, req.user.operador_nombre]
    );
    await audit(req, 'TURNO_CREADO', 'turnos', rows[0].id, { placa: plate, ticket });
    res.status(201).json({ success: true, record: serializeTurn(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return next(new ConflictError('La placa ya tiene un turno activo o el ticket ya existe.'));
    next(err);
  }
});

router.post('/turnos/:id/salida', requireActiveOperator, async (req, res, next) => {
  try {
    if (!id(req.params.id)) throw new ValidationError('Identificador de turno inválido.');
    const total = Number(req.body.totalCharged);
    const calculated = Number(req.body.originalTotalCharged ?? total);
    const hours = Number(req.body.chargedHours);
    if (!INTEGER(total) || !INTEGER(calculated) || !INTEGER(hours, { min: 1 })) throw new ValidationError('Cobro de salida inválido.');
    const { rows } = await req.dbClient.query(
      `UPDATE turnos SET estado = 'FINALIZADO', salida_en = NOW(), horas_cobradas = $1, total_cobrado = $2, total_calculado = $3
       WHERE id = $4 AND parqueadero_id = $5 AND estado = 'ACTIVO' RETURNING *`,
      [hours, total, calculated, req.params.id, req.parqueaderoId]
    );
    if (!rows[0]) throw new NotFoundError('Turno activo');
    await audit(req, 'TURNO_FINALIZADO', 'turnos', rows[0].id, { total });
    res.json({ success: true, record: serializeTurn(rows[0]) });
  } catch (err) { next(err); }
});

router.delete('/turnos/:id', requireRole('ADMIN', 'SUPERADMIN'), requirePrincipalOperator, async (req, res, next) => {
  try {
    const { rows } = await req.dbClient.query(
      `DELETE FROM turnos WHERE id = $1 AND parqueadero_id = $2 RETURNING id, placa`, [req.params.id, req.parqueaderoId]);
    if (!rows[0]) throw new NotFoundError('Turno');
    await audit(req, 'TURNO_ELIMINADO', 'turnos', rows[0].id, { placa: rows[0].placa });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/mensualidades', requirePrincipalOperator, async (req, res, next) => {
  try {
    const plate = normalizePlate(req.body.plate);
    if (!INTEGER(req.body.monthlyRate, { min: 1 }) || !req.body.vehicleType) throw new ValidationError('Datos de mensualidad inválidos.');
    const responsible = String(req.body.responsible || '').trim().slice(0, 150);
    const document = String(req.body.document || '').trim().slice(0, 20);
    const contact = String(req.body.contact || '').trim().slice(0, 20);
    const address = String(req.body.address || '').trim().slice(0, 150);
    const { rows: existingRows } = await req.dbClient.query(
      `SELECT ticket_numero, estado FROM mensualidades
       WHERE parqueadero_id = $1 AND placa = $2
       ORDER BY creado_en DESC LIMIT 1`,
      [req.parqueaderoId, plate]
    );
    if (existingRows[0]) {
      const existing = existingRows[0];
      if (existing.estado === 'ACTIVA') {
        throw new ConflictError(`La placa ${plate} ya tiene una mensualidad activa (MEN-${existing.ticket_numero}).`);
      }
      throw new ConflictError(`La placa ${plate} ya tiene un registro anterior (MEN-${existing.ticket_numero}). Usa el botón RENOVAR para crear la siguiente mensualidad.`);
    }
    const driverId = await upsertMonthlyDriver(req.dbClient, req.parqueaderoId, { responsible, document, contact, address });
    const ticket = await nextTicket(req, 'mensualidades');
    const { rows } = await req.dbClient.query(
      `INSERT INTO mensualidades (parqueadero_id, ticket_numero, placa, tipo_vehiculo, fecha_inicio, fecha_vencimiento, tarifa_mensual, responsable, documento, contacto, direccion, conductor_id, creado_por_id, creado_por_nombre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [req.parqueaderoId, ticket, plate, String(req.body.vehicleType).slice(0,20), req.body.startDate, req.body.expiryDate, Number(req.body.monthlyRate), responsible || null, document || null, contact || null, address || null, driverId, req.user.id, req.user.nombre]
    );
    const charge = await createMonthlyCharge(req.dbClient, rows[0]);
    await audit(req, 'MENSUALIDAD_CREADA', 'mensualidades', rows[0].id, { placa: plate });
    res.status(201).json({ success: true, record: serializeMonthly(rows[0]), charge: serializeMonthlyCharge(charge) });
  } catch (err) {
    if (err.code === '23505') return next(new ConflictError('La placa ya tiene una mensualidad activa o el ticket ya existe.'));
    next(err);
  }
});

router.post('/mensualidades/:id/renovar', requirePrincipalOperator, async (req, res, next) => {
  try {
    if (!id(req.params.id)) throw new ValidationError('Identificador de mensualidad inválido.');
    const { rows: previousRows } = await req.dbClient.query(
      `SELECT * FROM mensualidades WHERE id = $1 AND parqueadero_id = $2 FOR UPDATE`,
      [req.params.id, req.parqueaderoId]
    );
    const previous = previousRows[0];
    if (!previous) throw new NotFoundError('Mensualidad');
    if (previous.estado === 'ACTIVA') throw new ConflictError('La mensualidad todavía está activa y no se puede renovar.');

    const ticket = await nextTicket(req, 'mensualidades');
    const { rows } = await req.dbClient.query(
      `WITH periodo AS (SELECT $5::date AS fecha_inicio)
       INSERT INTO mensualidades (parqueadero_id, ticket_numero, placa, tipo_vehiculo, fecha_inicio, fecha_vencimiento, tarifa_mensual, responsable, documento, contacto, direccion, conductor_id, renovacion_de_id, creado_por_id, creado_por_nombre)
       SELECT $1,$2,$3,$4,periodo.fecha_inicio,(periodo.fecha_inicio + INTERVAL '1 month')::date,$6,$7,$8,$9,$10,$11,$12,$13,$14
       FROM periodo RETURNING *`,
      [req.parqueaderoId, ticket, previous.placa, previous.tipo_vehiculo, previous.fecha_vencimiento, previous.tarifa_mensual, previous.responsable, previous.documento, previous.contacto, previous.direccion, previous.conductor_id, previous.id, req.user.id, req.user.nombre]
    );
    const charge = await createMonthlyCharge(req.dbClient, rows[0]);
    await audit(req, 'MENSUALIDAD_RENOVADA', 'mensualidades', rows[0].id, { renovacion_de_id: previous.id, ticket });
    res.status(201).json({ success: true, record: serializeMonthly(rows[0]), charge: serializeMonthlyCharge(charge) });
  } catch (err) { next(err); }
});

router.patch('/mensualidad-cobros/:id', requirePrincipalOperator, async (req, res, next) => {
  try {
    if (!id(req.params.id) || !['POR_COBRAR', 'PAGADO'].includes(req.body.status)) {
      throw new ValidationError('Estado de cobro inválido.');
    }
    const { rows } = await req.dbClient.query(
      `WITH cambio AS (SELECT $1::varchar(20) AS estado)
       UPDATE gestion_cobros_mensualidades
       SET estado = cambio.estado,
           pagado_en = CASE WHEN cambio.estado = 'PAGADO'::varchar(20) THEN NOW() ELSE NULL END
       FROM cambio
       WHERE id = $2 AND parqueadero_id = $3 RETURNING *`,
      [req.body.status, req.params.id, req.parqueaderoId]
    );
    if (!rows[0]) throw new NotFoundError('Cobro de mensualidad');
    await audit(req, 'COBRO_MENSUALIDAD_ACTUALIZADO', 'gestion_cobros_mensualidades', rows[0].id, { status: rows[0].estado });
    res.json({ success: true, charge: serializeMonthlyCharge(rows[0]) });
  } catch (err) { next(err); }
});

router.post('/mensualidades/:id/cerrar', requirePrincipalOperator, async (req, res, next) => {
  try {
    const reason = String(req.body.reason || 'CIERRE MANUAL').slice(0, 80);
    const status = reason === 'VENCIMIENTO AUTOMATICO' ? 'VENCIDA' : 'CERRADA';
    const { rows } = await req.dbClient.query(
      `UPDATE mensualidades SET estado = $1, cerrada_en = CURRENT_DATE, motivo_cierre = $2
       WHERE id = $3 AND parqueadero_id = $4 AND estado = 'ACTIVA' RETURNING *`,
      [status, reason, req.params.id, req.parqueaderoId]
    );
    if (!rows[0]) throw new NotFoundError('Mensualidad activa');
    await audit(req, 'MENSUALIDAD_CERRADA', 'mensualidades', rows[0].id, { reason });
    res.json({ success: true, record: serializeMonthly(rows[0]) });
  } catch (err) { next(err); }
});

router.delete('/mensualidades/:id', requireRole('ADMIN', 'SUPERADMIN'), requirePrincipalOperator, async (req, res, next) => {
  try {
    const { rows } = await req.dbClient.query(`DELETE FROM mensualidades WHERE id = $1 AND parqueadero_id = $2 RETURNING id`, [req.params.id, req.parqueaderoId]);
    if (!rows[0]) throw new NotFoundError('Mensualidad');
    await audit(req, 'MENSUALIDAD_ELIMINADA', 'mensualidades', rows[0].id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/respaldo', requireRole('ADMIN', 'SUPERADMIN'), requirePrincipalOperator, async (req, res, next) => {
  try {
    const [park, turns, monthly] = await Promise.all([
      req.dbClient.query(`SELECT id, codigo, nombre, nit, direccion, ciudad, departamento, telefono, email, plan FROM parqueaderos WHERE id = $1`, [req.parqueaderoId]),
      req.dbClient.query(`SELECT * FROM turnos WHERE parqueadero_id = $1 ORDER BY ingreso_en DESC`, [req.parqueaderoId]),
      req.dbClient.query(`SELECT * FROM mensualidades WHERE parqueadero_id = $1 ORDER BY creado_en DESC`, [req.parqueaderoId]),
    ]);
    await audit(req, 'RESPALDO_EXPORTADO', 'parqueaderos', req.parqueaderoId);
    res.setHeader('Content-Disposition', `attachment; filename="respaldo-${park.rows[0]?.codigo || 'parqueadero'}-${new Date().toISOString().slice(0,10)}.json"`);
    res.json({ version: 1, generado_en: new Date().toISOString(), parqueadero: park.rows[0], turnos: turns.rows, mensualidades: monthly.rows });
  } catch (err) { next(err); }
});

module.exports = router;
