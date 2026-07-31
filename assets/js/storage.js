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
const API_BASE = 'http://localhost:3000/api';

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
  // SECCIÓN 6: Usuarios clientes finales (multicuentas)
  clientUsers:     "mptClientUsers",
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
  // Usuarios clientes finales (MULTICUENTAS - preparado)
  getUsers,
  saveUsers,
  findUserById,
  findUserByEmail,
};
