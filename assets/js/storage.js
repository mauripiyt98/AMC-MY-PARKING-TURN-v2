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
//   Esto garantiza aislamiento de datos entre distintos
//   clientes SaaS que usen el mismo navegador.
// ============================================================

// ============================================================
// SECCION 1 — SESION Y TENANT
// ============================================================

const SESSION_KEYS = {
  user:         "mptUser",
  userName:     "mptUserName",
  tenantId:     "mptTenantId",
  role:         "mptRole",
  sessionToken: "mptSessionToken",
};

/**
 * Devuelve el tenantId del cliente SaaS activo.
 * En la fase de backend, este valor vendrá del JWT.
 */
function getActiveTenantId() {
  return sessionStorage.getItem(SESSION_KEYS.tenantId) || "tenant_default";
}

/**
 * Devuelve el nombre del usuario activo.
 */
function getActiveUserName() {
  return sessionStorage.getItem(SESSION_KEYS.userName) || "USUARIO NO IDENTIFICADO";
}

/**
 * Devuelve el rol del usuario activo.
 * Roles definidos: "admin" | "operator"
 */
function getActiveUserRole() {
  return sessionStorage.getItem(SESSION_KEYS.role) || "operator";
}

/**
 * Devuelve true si hay una sesion activa valida.
 */
function hasActiveSession() {
  const user    = sessionStorage.getItem(SESSION_KEYS.user);
  const tenant  = sessionStorage.getItem(SESSION_KEYS.tenantId);
  const token   = sessionStorage.getItem(SESSION_KEYS.sessionToken);
  return !!(user && tenant && token);
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
  sessionStorage.setItem(SESSION_KEYS.user,         sessionData.user);
  sessionStorage.setItem(SESSION_KEYS.userName,     sessionData.userName);
  sessionStorage.setItem(SESSION_KEYS.tenantId,     sessionData.tenantId);
  sessionStorage.setItem(SESSION_KEYS.role,         sessionData.role);
  sessionStorage.setItem(SESSION_KEYS.sessionToken, sessionData.sessionToken);
}

/**
 * Elimina todos los datos de sesion (logout).
 */
function clearSession() {
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
// SECCION 5 — EXPORTACION
// Todos los modulos importan desde window.MPTStorage
// ============================================================

window.MPTStorage = {
  // Sesion
  SESSION_KEYS,
  getActiveTenantId,
  getActiveUserName,
  getActiveUserRole,
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
  // Mensualidades
  getMonthlyRecords,
  saveMonthlyRecords,
  getMonthlyHistory,
  saveMonthlyHistory,
  getStoredNextMonthlyTicket,
  saveNextMonthlyTicket,
};
