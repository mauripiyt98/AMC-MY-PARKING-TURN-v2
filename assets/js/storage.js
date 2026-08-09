// ============================================================
// storage.js — Capa de abstraccion de datos SaaS
// My Parking Turn v2
//
// ARQUITECTURA:
//   Hoy  → localStorage namespaceado por tenantId (offline/demo)
//   Luego → reemplazar getItem/setItem por fetch('/api/...')
//           sin modificar el resto del codigo.
//
// MULTI-TENANT:
//   Todos los keys incluyen el tenantId del cliente activo.
//   En modo backend (JWT activo): tenantId = parqueadero_id del JWT.
//   En modo local (fallback):     tenantId = sessionStorage mptTenantId.
//   Esto garantiza aislamiento de datos entre distintos clientes.
// ============================================================

// ── URL del backend ────────────────────────────────────────────
const API_BASE = window.MPT_API_BASE || '/api';
let remoteHydration = null;

// ============================================================
// SECCION 1 — SESION Y TENANT
// ============================================================

// ── Claves de sessionStorage (sincronizadas con auth.js y session-guard.js) ──
const SESSION_KEYS = {
  user:              'mptUser',
  userName:          'mptUserName',
  tenantId:          'mptTenantId',
  role:              'mptRole',
  sessionToken:      'mptSessionToken',
  codigoParqueadero: 'mptCodigoParqueadero',
  // JWT (fase backend)
  sessionJwt:  'mptSessionV2',
  userJwt:     'mptUserV2',
  baseSessionJwt: 'mptBaseSessionV2',
  activeOperator: 'mptActiveOperator',
  // Legacy flag (compatibilidad con session-guard.js)
  sessionLegacy: 'mptSessionActive',
};

/**
 * Devuelve el token de sesión actual (JWT o token local).
 * Usado para las llamadas a la API REST.
 */
function getSessionToken() {
  // Intentar JWT del backend primero
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.sessionJwt);
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.token) return session.token;
    }
  } catch { /* ignorar */ }
  // Fallback: token local
  return sessionStorage.getItem(SESSION_KEYS.sessionToken) || null;
}

/**
 * Devuelve true si hay una sesión JWT activa y no expirada.
 */
function hasJwtSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEYS.sessionJwt);
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session || !session.token) return false;
    const parts = session.token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    const now     = Math.floor(Date.now() / 1000);
    return !!(payload.exp && payload.exp > (now + 30));
  } catch { return false; }
}

/**
 * Devuelve el tenantId del cliente SaaS activo.
 * En modo backend (JWT activo): viene del parqueadero_id del JWT.
 * En modo local (fallback): viene de sessionStorage.
 */
function getActiveTenantId() {
  // Preferir parqueadero_id del JWT
  if (hasJwtSession()) {
    try {
      const raw  = sessionStorage.getItem(SESSION_KEYS.userJwt);
      const user = raw ? JSON.parse(raw) : null;
      if (user && user.parqueadero_id) return user.parqueadero_id;
    } catch { /* ignorar */ }
  }
  return sessionStorage.getItem(SESSION_KEYS.tenantId) || 'tenant_default';
}

/**
 * Devuelve el nombre del usuario activo.
 */
function getActiveUserName() {
  return sessionStorage.getItem(SESSION_KEYS.userName) || 'USUARIO NO IDENTIFICADO';
}

/**
 * Devuelve el rol del usuario activo.
 * Roles definidos: "admin" | "operator" | "superadmin"
 */
function getActiveUserRole() {
  return sessionStorage.getItem(SESSION_KEYS.role) || 'operator';
}

/**
 * Devuelve el código del parqueadero activo (para mostrar en UI).
 */
function getActiveCodigoParqueadero() {
  return sessionStorage.getItem(SESSION_KEYS.codigoParqueadero) || 'PARK001';
}

/**
 * Devuelve true si hay una sesion activa valida.
 * Acepta tanto sesion JWT (backend) como sesion local.
 */
function hasActiveSession() {
  const user    = sessionStorage.getItem(SESSION_KEYS.user);
  const token   = sessionStorage.getItem(SESSION_KEYS.sessionToken);
  const legacy  = sessionStorage.getItem(SESSION_KEYS.sessionLegacy);
  // Sesion local completa O flag legacy activo
  return !!(user && token) || legacy === 'true';
}

/**
 * Guarda la sesion completa tras autenticacion exitosa.
 * @param {object} sessionData
 */
function saveSession(sessionData) {
  sessionStorage.setItem(SESSION_KEYS.user,              sessionData.user || sessionData.userId || '');
  sessionStorage.setItem(SESSION_KEYS.userName,          sessionData.userName || sessionData.name || '');
  sessionStorage.setItem(SESSION_KEYS.tenantId,          sessionData.tenantId || 'tenant_default');
  sessionStorage.setItem(SESSION_KEYS.role,              sessionData.role || 'operator');
  sessionStorage.setItem(SESSION_KEYS.sessionToken,      sessionData.sessionToken || '');
  sessionStorage.setItem(SESSION_KEYS.codigoParqueadero, sessionData.codigoParqueadero || 'PARK001');
  // Activar flag legacy para compatibilidad con session-guard.js
  sessionStorage.setItem(SESSION_KEYS.sessionLegacy, 'true');
}

/**
 * Elimina todos los datos de sesion (logout).
 */
function clearSession() {
  // Limpiar todas las claves de sesion (local + JWT + legacy)
  Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
}

function getActiveOperator() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEYS.activeOperator) || 'null'); }
  catch { return null; }
}

function saveActiveOperator(session) {
  if (!sessionStorage.getItem(SESSION_KEYS.baseSessionJwt)) {
    const current = sessionStorage.getItem(SESSION_KEYS.sessionJwt);
    if (current) sessionStorage.setItem(SESSION_KEYS.baseSessionJwt, current);
  }
  const data = { token: session.token, expiraEn: session.expira_en };
  sessionStorage.setItem(SESSION_KEYS.sessionJwt, JSON.stringify(data));
  sessionStorage.setItem(SESSION_KEYS.sessionToken, session.token);
  if (session.rol) sessionStorage.setItem(SESSION_KEYS.role, String(session.rol).toLowerCase());
  sessionStorage.setItem(SESSION_KEYS.activeOperator, JSON.stringify(session.operador));
}

async function closeActiveOperator() {
  if (getActiveOperator() && hasJwtSession()) {
    await apiRequest('/auth/operadores/cerrar', { method: 'POST', body: JSON.stringify({}) });
  }
  const base = sessionStorage.getItem(SESSION_KEYS.baseSessionJwt);
  if (base) {
    const parsed = JSON.parse(base);
    sessionStorage.setItem(SESSION_KEYS.sessionJwt, base);
    sessionStorage.setItem(SESSION_KEYS.sessionToken, parsed.token || '');
    try {
      const payload = JSON.parse(atob(String(parsed.token || '').split('.')[1] || ''));
      if (payload.rol) sessionStorage.setItem(SESSION_KEYS.role, String(payload.rol).toLowerCase());
    } catch { /* La sesiÃ³n base se validarÃ¡ nuevamente en el servidor. */ }
  }
  sessionStorage.removeItem(SESSION_KEYS.activeOperator);
}


/**
 * Guarda la sesion completa tras autenticacion exitosa.
 * @param {object} sessionData
 * @param {string} sessionData.user        - ID de usuario (numerico)
 * @param {string} sessionData.userName    - Nombre visible del usuario
 * @param {string} sessionData.tenantId    - ID del cliente SaaS
 * @param {string} sessionData.role        - Rol: "admin" | "operator"
 * @param {string} sessionData.sessionToken - Token de sesion
 */
function saveSession(sessionData) {
  sessionStorage.setItem(SESSION_KEYS.user,         sessionData.user || sessionData.userId || '');
  sessionStorage.setItem(SESSION_KEYS.userName,     sessionData.userName || sessionData.name || '');
  sessionStorage.setItem(SESSION_KEYS.tenantId,     sessionData.tenantId || 'tenant_default');
  sessionStorage.setItem(SESSION_KEYS.role,         sessionData.role || 'operator');
  sessionStorage.setItem(SESSION_KEYS.sessionToken, sessionData.sessionToken || '');
  // Activar flag legacy para compatibilidad con session-guard.js
  sessionStorage.setItem(SESSION_KEYS.sessionLegacy, 'true');
}

/**
 * Elimina todos los datos de sesion (logout).
 */
function clearSession() {
  // Limpiar todas las claves de sesion (local + JWT + legacy)
  Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
}

// ============================================================
// SECCION 2 — STORAGE NAMESPACEADO POR TENANT
//
// TODO (fase backend): reemplazar _localGet/_localSet
//   por llamadas fetch() a la API REST:
//   GET  /api/tenant/:tenantId/:key
//   POST /api/tenant/:tenantId/:key  { value }
// ============================================================

function _buildKey(key) {
  return `${getActiveTenantId()}__${key}`;
}

function _localGet(key) {
  try {
    return JSON.parse(localStorage.getItem(_buildKey(key)) || "null");
  } catch {
    return null;
  }
}

function _localSet(key, value) {
  localStorage.setItem(_buildKey(key), JSON.stringify(value));
}

function _replaceLocal(key, value) {
  _localSet(key, value);
}

async function apiRequest(path, options = {}) {
  const token = getSessionToken();
  if (!hasJwtSession() || !token) throw new Error('La sesión segura no está disponible. Inicia sesión nuevamente.');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible sincronizar con el servidor.');
  return data;
}

/**
 * Descarga la fuente de verdad PostgreSQL para el tenant autenticado.
 * localStorage queda solamente como caché de interfaz/offline; no se usa para
 * compartir información entre equipos.
 */
function hydrateFromServer() {
  if (!hasJwtSession()) return Promise.resolve(false);
  if (!remoteHydration) {
    remoteHydration = apiRequest('/operacion/estado')
      .then((state) => {
        _replaceLocal(KEYS.plateRecords, state.records || []);
        _replaceLocal(KEYS.plateHistory, state.history || []);
        _replaceLocal(KEYS.monthlyRecords, state.monthlyRecords || []);
        _replaceLocal(KEYS.monthlyHistory, state.monthlyHistory || []);
        const nextTurn = Math.max(0, ...(state.records || []), ...(state.history || [])
          .map((record) => Number(record.ticketNumber) || 0)) + 1;
        const nextMonthly = Math.max(0, ...(state.monthlyRecords || []), ...(state.monthlyHistory || [])
          .map((record) => Number(record.ticketNumber) || 0)) + 1;
        _replaceLocal(KEYS.nextTicket, nextTurn);
        _replaceLocal(KEYS.monthlyTicket, nextMonthly);
        window.dispatchEvent(new CustomEvent('mpt:storage-hydrated'));
        return true;
      })
      .catch((error) => {
        console.warn('[MPT] No se pudo cargar la operación remota:', error.message);
        return false;
      });
  }
  return remoteHydration;
}

async function createTurn(record) {
  const data = await apiRequest('/operacion/turnos', { method: 'POST', body: JSON.stringify(record) });
  const records = getRecords();
  records.unshift(data.record);
  saveRecords(records);
  saveNextTicketNumber(Math.max(getStoredNextTicketNumber(), Number(data.record.ticketNumber) + 1));
  return data.record;
}

async function closeTurn(id, charge) {
  const data = await apiRequest(`/operacion/turnos/${encodeURIComponent(id)}/salida`, { method: 'POST', body: JSON.stringify(charge) });
  const records = getRecords().filter((record) => record.id !== id);
  const history = getHistory().filter((record) => record.id !== id);
  history.unshift(data.record);
  saveRecords(records);
  saveHistory(history);
  return data.record;
}

async function deleteTurn(id) {
  await apiRequest(`/operacion/turnos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  saveRecords(getRecords().filter((record) => record.id !== id));
  saveHistory(getHistory().filter((record) => record.id !== id));
}

async function createMonthly(record) {
  const data = await apiRequest('/operacion/mensualidades', { method: 'POST', body: JSON.stringify(record) });
  const records = getMonthlyRecords();
  records.unshift(data.record);
  saveMonthlyRecords(records);
  saveNextMonthlyTicket(Math.max(getStoredNextMonthlyTicket(), Number(data.record.ticketNumber) + 1));
  return data.record;
}

async function closeMonthly(id, reason = 'CIERRE MANUAL') {
  const data = await apiRequest(`/operacion/mensualidades/${encodeURIComponent(id)}/cerrar`, { method: 'POST', body: JSON.stringify({ reason }) });
  saveMonthlyRecords(getMonthlyRecords().filter((record) => record.id !== id));
  const history = getMonthlyHistory().filter((record) => record.id !== id);
  history.unshift(data.record);
  saveMonthlyHistory(history);
  return data.record;
}

async function deleteMonthly(id) {
  await apiRequest(`/operacion/mensualidades/${encodeURIComponent(id)}`, { method: 'DELETE' });
  saveMonthlyRecords(getMonthlyRecords().filter((record) => record.id !== id));
  saveMonthlyHistory(getMonthlyHistory().filter((record) => record.id !== id));
}

// ============================================================
// SECCION 3 — TURNOS POR HORAS (modulo principal)
// ============================================================

const KEYS = {
  plateRecords:    "mptPlateRecords",
  plateHistory:    "mptPlateHistory",
  nextTicket:      "mptNextTicketNumber",
  monthlyRecords:  "mptMonthlyRecords",
  monthlyHistory:  "mptMonthlyHistory",
  monthlyTicket:   "mptNextMonthlyTicket",
  parkingProfile:  "mptParkingProfile",
  parkingPrices:   "mptParkingPrices",
  // SECCIÓN 6: Usuarios clientes finales (multicuentas)
  clientUsers:     "mptClientUsers",
  tenants:         "mptTenants",
};

function getRecords() {
  return _localGet(KEYS.plateRecords) || [];
}

function saveRecords(records) {
  _localSet(KEYS.plateRecords, records);
}

function getHistory() {
  return _localGet(KEYS.plateHistory) || [];
}

function saveHistory(history) {
  _localSet(KEYS.plateHistory, history);
}

function getStoredNextTicketNumber() {
  const stored = _localGet(KEYS.nextTicket);
  const n = Number(stored);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function saveNextTicketNumber(n) {
  _localSet(KEYS.nextTicket, n);
}

// ============================================================
// SECCION 4 — MENSUALIDADES
// ============================================================

function getMonthlyRecords() {
  return _localGet(KEYS.monthlyRecords) || [];
}

function saveMonthlyRecords(records) {
  _localSet(KEYS.monthlyRecords, records);
}

function getMonthlyHistory() {
  return _localGet(KEYS.monthlyHistory) || [];
}

function saveMonthlyHistory(history) {
  _localSet(KEYS.monthlyHistory, history);
}

function getStoredNextMonthlyTicket() {
  const stored = _localGet(KEYS.monthlyTicket);
  const n = Number(stored);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function saveNextMonthlyTicket(n) {
  _localSet(KEYS.monthlyTicket, n);
}

// ============================================================
// SECCION 5 — PERFIL DEL PARQUEADERO
// ============================================================

/** Retorna el perfil comercial del parqueadero de la sesión activa. */
function getParkingProfile() {
  return _localGet(KEYS.parkingProfile) || null;
}

/** Guarda el perfil comercial aislado para el parqueadero de la sesión activa. */
function saveParkingProfile(profile) {
  _localSet(KEYS.parkingProfile, profile);
}

// ============================================================
// SECCION 6 — TARIFAS DEL PARQUEADERO
// ============================================================

const DEFAULT_PARKING_PRICES = Object.freeze({ moto: 1500, carro: 2500 });

function normalizePrice(value, fallback) {
  const price = Number(value);
  return Number.isInteger(price) && price > 0 ? price : fallback;
}

/** Retorna las tarifas por hora del parqueadero de la sesión activa. */
function getParkingPrices() {
  const saved = _localGet(KEYS.parkingPrices) || {};
  return {
    moto: normalizePrice(saved.moto, DEFAULT_PARKING_PRICES.moto),
    carro: normalizePrice(saved.carro, DEFAULT_PARKING_PRICES.carro),
  };
}

/** Guarda las tarifas por hora separadas para el parqueadero activo. */
function saveParkingPrices(prices) {
  _localSet(KEYS.parkingPrices, {
    moto: normalizePrice(prices?.moto, DEFAULT_PARKING_PRICES.moto),
    carro: normalizePrice(prices?.carro, DEFAULT_PARKING_PRICES.carro),
  });
}

// ============================================================
// SECCION 6 — BASE DE DATOS DE USUARIOS CLIENTES FINALES
//
// Almacena los usuarios creados por el desarrollador/admin.
// PREPARADO para el sistema multicuenta SaaS:
//   Cada usuario tendrá un tenantId que lo vinculará con
//   la cuenta del parqueadero cliente al que pertenece.
//
// Estructura de cada registro:
// {
//   id:           string  — Número de documento (cédula/NIT/pasaporte)
//   email:        string  — Correo para recuperación de contraseña
//   passwordHash: string  — Hash SHA-256 de la contraseña
//   role:         string  — "admin" | "operator"
//   status:       string  — "active" | "inactive"
//   tenantId:     string  — ID del cliente SaaS (MULTICUENTAS)
//   createdAt:    string  — ISO 8601 timestamp de creación
//   createdBy:    string  — ID del usuario que lo creó
// }
//
// TODO (fase backend): reemplazar getUsers/saveUsers
//   por llamadas fetch() al endpoint REST:
//   GET  /api/users
//   POST /api/users
//   PUT  /api/users/:id
//   DELETE /api/users/:id
// ============================================================

/**
 * Retorna todos los usuarios clientes registrados.
 * @returns {Array} Lista de objetos de usuario
 */
function getUsers() {
  try {
    const raw = localStorage.getItem(KEYS.clientUsers);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persiste la lista completa de usuarios.
 * @param {Array} users
 */
function saveUsers(users) {
  localStorage.setItem(KEYS.clientUsers, JSON.stringify(users));
}

/** Retorna los espacios independientes registrados en modo local. */
function getTenants() {
  try {
    const raw = localStorage.getItem(KEYS.tenants);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Persiste el registro de espacios independientes en modo local. */
function saveTenants(tenants) {
  localStorage.setItem(KEYS.tenants, JSON.stringify(tenants));
}

/** Retorna la cuenta principal, separada de los usuarios de clientes. */
function getDeveloperUser() {
  try {
    const raw = localStorage.getItem('mptDeveloperUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Busca un usuario por su ID de documento.
 * @param {string} id
 * @returns {object|null}
 */
function findUserById(id) {
  return getUsers().find((u) => u.id === id) || null;
}

/**
 * Busca un usuario por su correo electrónico.
 * @param {string} email
 * @returns {object|null}
 */
function findUserByEmail(email) {
  return getUsers().find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  ) || null;
}

// ============================================================
// SECCION 5 — EXPORTACION
// Todos los modulos importan desde window.MPTStorage
// ============================================================

window.MPTStorage = {
  // Sesion
  SESSION_KEYS,
  getActiveTenantId,
  getActiveUserName,
  getActiveUserRole,
  getActiveOperator,
  saveActiveOperator,
  closeActiveOperator,
  getActiveCodigoParqueadero,
  getSessionToken,
  apiRequest,
  hasJwtSession,
  hasActiveSession,
  saveSession,
  clearSession,
  // Turnos por horas
  getRecords,
  saveRecords,
  getHistory,
  saveHistory,
  getStoredNextTicketNumber,
  saveNextTicketNumber,
  hydrateFromServer,
  createTurn,
  closeTurn,
  deleteTurn,
  // Mensualidades
  getMonthlyRecords,
  saveMonthlyRecords,
  getMonthlyHistory,
  saveMonthlyHistory,
  getStoredNextMonthlyTicket,
  saveNextMonthlyTicket,
  createMonthly,
  closeMonthly,
  deleteMonthly,
  // Perfil del parqueadero
  getParkingProfile,
  saveParkingProfile,
  // Tarifas por hora
  getParkingPrices,
  saveParkingPrices,
  // Usuarios clientes finales (MULTICUENTAS - preparado)
  getUsers,
  saveUsers,
  getTenants,
  saveTenants,
  getDeveloperUser,
  findUserById,
  findUserByEmail,
};

// Inicia la carga sin bloquear la interfaz. Cada página vuelve a renderizar al
// recibir el evento `mpt:storage-hydrated`.
hydrateFromServer();
