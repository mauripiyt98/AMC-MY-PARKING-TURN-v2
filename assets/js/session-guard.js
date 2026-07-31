// ============================================================
// session-guard.js — Guarda de rutas My Parking Turn v2
//
// SISTEMA HÍBRIDO: acepta sesiones JWT (backend) y sesiones locales.
//
//  Sesión JWT   → token en sessionStorage bajo 'mptSessionV2'
//  Sesión local → flag 'mptSessionActive' = "true" en sessionStorage
//
// Se debe incluir como PRIMER script en CADA página interna.
// Si no hay sesión válida → redirige al login.
//
// MULTICUENTAS:
//   También inicializa las credenciales por defecto del desarrollador
//   en localStorage si aún no existen, garantizando que el sistema
//   funcione en cualquier navegador desde el primer acceso.
//
// CUANDO SE INTEGRE EL BACKEND:
//   Activar la verificación JWT en isJwtValid().
//   Agregar validación remota del token contra el endpoint:
//   GET /api/auth/verify  { Authorization: Bearer <token> }
// ============================================================

(function guardSession() {
  'use strict';

  // ── Claves de sesión ─────────────────────────────────────────
  var SESSION_KEY_JWT    = 'mptSessionV2';     // JWT (backend futuro)
  var USER_KEY_JWT       = 'mptUserV2';        // Datos JWT
  var SESSION_KEY_LEGACY = 'mptSessionActive'; // Sesión local

  // ── Claves de localStorage ──────────────────────────────────
  var DEV_USER_KEY    = 'mptDeveloperUser';
  var CLIENT_USERS_KEY = 'mptClientUsers';

  // ── Verificar JWT válido y no expirado ───────────────────────
  function isJwtValid() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY_JWT);
      if (!raw) return false;
      var session = JSON.parse(raw);
      if (!session || !session.token) return false;

      var parts = session.token.split('.');
      if (parts.length !== 3) return false;

      var payload = JSON.parse(atob(parts[1]));
      var now     = Math.floor(Date.now() / 1000);
      return !!(payload.exp && payload.exp > (now + 30));
    } catch (e) {
      return false;
    }
  }

  // ── Verificar sesión local activa ───────────────────────────
  function isLocalSessionActive() {
    var user  = sessionStorage.getItem('mptUser');
    var token = sessionStorage.getItem('mptSessionToken');
    return !!(user && token);
  }

  // ── Sincronizar datos del usuario desde JWT ──────────────────
  function syncFromJwt() {
    try {
      var raw  = sessionStorage.getItem(USER_KEY_JWT);
      if (!raw) return;
      var user = JSON.parse(raw);
      if (!user) return;
      if (!sessionStorage.getItem('mptUser') && user.userId) {
        sessionStorage.setItem('mptUser',     user.userId);
        sessionStorage.setItem('mptUserName', user.name || '');
        sessionStorage.setItem('mptRole',     user.role || 'operator');
        sessionStorage.setItem('mptTenantId', user.tenantId || 'tenant_default');
      }
    } catch (e) { /* silencioso */ }
  }

  // ── Inicializar usuario desarrollador en localStorage ────────
  // Garantiza que CUALQUIER navegador tenga la base de usuarios
  // disponible para el modo local (sin backend).
  function initDefaultDevUser() {
    try {
      if (!localStorage.getItem(DEV_USER_KEY)) {
        localStorage.setItem(DEV_USER_KEY, JSON.stringify({
          userId:       '1110591592',
          name:         'USUARIO DESARROLLADOR',
          role:         'admin',
          email:        'dev@mpt.com',
          passwordHash: null,
          tenantId:     'tenant_default',
        }));
      }
      if (!localStorage.getItem(CLIENT_USERS_KEY)) {
        localStorage.setItem(CLIENT_USERS_KEY, JSON.stringify([]));
      }
    } catch (e) { /* localStorage no disponible */ }
  }

  // ── Limpiar sesión corrupta y redirigir al login ─────────────
  function redirectToLogin() {
    var depth    = (window.location.pathname.match(/\//g) || []).length - 1;
    var rootPath = depth <= 1 ? './' : '../'.repeat(depth - 1);

    [
      'mptUser', 'mptUserName', 'mptTenantId',
      'mptRole', 'mptSessionToken',
      SESSION_KEY_JWT, USER_KEY_JWT, SESSION_KEY_LEGACY,
    ].forEach(function (key) { sessionStorage.removeItem(key); });

    window.location.replace(rootPath + 'index.html');
  }

  // ── Determinar estado de sesión ──────────────────────────────
  var jwtOk      = isJwtValid();
  var localOk    = isLocalSessionActive();
  var isLoggedIn = jwtOk || localOk;

  // Sincronizar datos si hay JWT activo
  if (jwtOk) syncFromJwt();

  // Siempre inicializar credenciales por defecto
  initDefaultDevUser();

  // ── Redirigir si no está autenticado ─────────────────────────
  if (!isLoggedIn) {
    redirectToLogin();
    return;
  }

  // TODO (fase backend): validar el token remotamente antes de continuar
  // fetch('/api/auth/verify', {
  //   headers: { Authorization: 'Bearer ' + sessionStorage.getItem('mptSessionToken') }
  // }).then(function (res) {
  //   if (!res.ok) redirectToLogin();
  // }).catch(function () { redirectToLogin(); });

})();
