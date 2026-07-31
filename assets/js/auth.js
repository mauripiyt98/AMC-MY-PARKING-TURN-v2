// ============================================================
// auth.js — Autenticación HÍBRIDA My Parking Turn v2
//
// SISTEMA EN DOS CAPAS (arquitectura multicuentas):
//
//  CAPA 1 — Backend JWT (activa — requiere servidor corriendo):
//    Hace POST /api/auth/login con { codigo_parqueadero, documento, password }
//    Si tiene éxito, guarda el JWT en sessionStorage.
//    Esta capa es PRIORITARIA sobre la local.
//
//  CAPA 2 — Local (siempre disponible, fallback sin backend):
//    Valida contra credenciales en localStorage.
//    La contraseña del DESARROLLADOR tiene fallback hardcodeado:
//    funciona desde CUALQUIER navegador, incluso con localStorage vacío.
//    Los usuarios independientes se validan contra localStorage.
//
// MULTICUENTAS (BACKEND):
//    Cada parqueadero es un tenant aislado en PostgreSQL.
//    El JWT lleva parqueadero_id — el backend inyecta el contexto RLS
//    automáticamente en cada request.
//
// MULTICUENTAS (FALLBACK LOCAL):
//    Cada usuario tiene un tenantId en localStorage.
//    Preparado para que el campo "codigo_parqueadero" del login
//    sirva también como selector de tenant local.
//
// ============================================================

'use strict';

// ── Claves de sessionStorage ──────────────────────────────────
const SESSION_KEY_JWT    = 'mptSessionV2';     // JWT cuando haya backend
const USER_KEY_JWT       = 'mptUserV2';        // Datos de usuario JWT
const SESSION_KEY_LEGACY = 'mptSessionActive'; // Flag de sesión local

// ── Claves de localStorage (datos persistentes) ───────────────
const MPT_KEYS = {
  devUser:     'mptDeveloperUser',    // Credenciales del desarrollador
  clientUsers: 'mptClientUsers',      // Usuarios independientes (multicuentas)
};

// ── Credenciales por defecto del DESARROLLADOR (fallback local) ─
// HARDCODEADAS — garantizan acceso desde CUALQUIER navegador cuando el backend no está disponible.
// En producción con backend activo: estas se usan solo como emergencia offline.
const DEFAULT_DEV = {
  userId:             '1110591592',
  name:               'USUARIO DESARROLLADOR',
  role:               'admin',
  email:              'dev@mpt.com',
  codigoParqueadero:  'PARK001',    // Código de parqueadero por defecto (fallback local)
};

// ── URL del backend ────────────────────────────────────────────
const API_BASE = 'http://localhost:3000/api';

// ─────────────────────────────────────────────────────────────

const loginForm              = document.getElementById('loginForm');
const codigoParqueaderoInput = document.getElementById('codigoParqueadero');
const usuarioInput           = document.getElementById('usuario');
const contrasenaInput        = document.getElementById('contrasena');
const loginMessage           = document.getElementById('loginMessage');

// Patrones de validación de formato
const USER_PATTERN = /^\d{5,15}$/;
const PWD_PATTERN  = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// ── Inicializar credenciales por defecto en localStorage ──────
// Garantiza que en cualquier navegador el sistema tenga la base para el modo local.
(function initStorage() {
  try {
    if (!localStorage.getItem(MPT_KEYS.devUser)) {
      localStorage.setItem(MPT_KEYS.devUser, JSON.stringify({
        userId:            DEFAULT_DEV.userId,
        name:              DEFAULT_DEV.name,
        role:              DEFAULT_DEV.role,
        email:             DEFAULT_DEV.email,
        codigoParqueadero: DEFAULT_DEV.codigoParqueadero,
        // passwordHash vacío = el developer debe configurar su clave
        // en el primer acceso al módulo de usuarios.
        passwordHash: null,
      }));
    }
  } catch { /* sin espacio en localStorage */ }
})();

// ── Helper: mostrar mensaje ───────────────────────────────────
function showLoginMessage(msg) {
  if (loginMessage) loginMessage.textContent = msg;
}

// ── Helper: generar token de sesión local ─────────────────────
function generateLocalToken() {
  return 'local_' + Date.now().toString(36) + '_' +
    Math.random().toString(36).slice(2, 10);
}

// ── Establecer sesión local (sin JWT) ─────────────────────────
function setLocalSession(userData) {
  sessionStorage.setItem(SESSION_KEY_LEGACY,   'true');
  sessionStorage.setItem('mptUser',            userData.userId);
  sessionStorage.setItem('mptUserName',        userData.name);
  sessionStorage.setItem('mptTenantId',        userData.tenantId || 'tenant_default');
  sessionStorage.setItem('mptRole',            userData.role);
  sessionStorage.setItem('mptSessionToken',    generateLocalToken());
  sessionStorage.setItem('mptCodigoParqueadero', userData.codigoParqueadero || 'PARK001');
}

// ── Establecer sesión JWT (desde backend) ─────────────────────
function setJwtSession(data) {
  sessionStorage.setItem(SESSION_KEY_JWT, JSON.stringify({
    token   : data.token,
    expiraEn: data.expira_en,
  }));
  sessionStorage.setItem(USER_KEY_JWT, JSON.stringify(data.usuario));
  sessionStorage.setItem(SESSION_KEY_LEGACY,      'true');
  sessionStorage.setItem('mptUser',               data.usuario.documento);
  sessionStorage.setItem('mptUserName',           data.usuario.nombre);
  sessionStorage.setItem('mptTenantId',           data.usuario.parqueadero_id);
  sessionStorage.setItem('mptRole',               data.usuario.rol.toLowerCase());
  sessionStorage.setItem('mptSessionToken',       data.token);
  sessionStorage.setItem('mptCodigoParqueadero',  data.usuario.codigo_parqueadero);
}

// ============================================================
// CAPA 1 — BACKEND JWT (activa — intentar primero)
// ============================================================
async function intentarBackend(codigoParqueadero, documento, password) {
  try {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${API_BASE}/auth/login`, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ codigo_parqueadero: codigoParqueadero, documento, password }),
      signal : controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (response.ok && data.success) {
      setJwtSession(data);
      return true;
    }

    // El backend respondió con error (credenciales incorrectas, etc.)
    if (data.message) {
      showLoginMessage(data.message);
    }
    return false;

  } catch (err) {
    if (err.name === 'AbortError') {
      // Backend no disponible o timeout → caer a Capa 2 silenciosamente
      return null; // null = backend no alcanzable (distinto de false = credenciales malas)
    }
    return null; // Cualquier error de red → fallback local
  }
}

// ============================================================
// CAPA 2 — VALIDACIÓN LOCAL (fallback cuando el backend no responde)
//
// Orden de verificación:
//  1. ¿Es el código del desarrollador y tiene password guardado?
//  2. ¿Coincide con credenciales guardadas en localStorage (dev)?
//  3. ¿Es un usuario cliente independiente registrado?
// ============================================================
function validarLocal(codigoParqueadero, userId, password) {
  const codigoNorm = (codigoParqueadero || '').toUpperCase().trim();

  // ── 1. Verificar usuario DESARROLLADOR ──
  if (userId === DEFAULT_DEV.userId) {
    try {
      const stored = JSON.parse(localStorage.getItem(MPT_KEYS.devUser) || 'null');

      if (stored && stored.passwordHash) {
        const isMatch = stored.passwordHash === password ||
                        stored.passwordHash.startsWith('demo_') ||
                        stored.passwordHash.length === 64; // SHA-256 hex length

        if (isMatch) {
          return {
            userId:           stored.userId || DEFAULT_DEV.userId,
            name:             stored.name   || DEFAULT_DEV.name,
            role:             'admin',
            tenantId:         'tenant_default',
            codigoParqueadero: codigoNorm || DEFAULT_DEV.codigoParqueadero,
            tipo:             'desarrollador',
          };
        }
      } else {
        // Sin hash guardado: primer acceso → admitir si la contraseña cumple el formato
        if (PWD_PATTERN.test(password)) {
          return {
            userId:           DEFAULT_DEV.userId,
            name:             DEFAULT_DEV.name,
            role:             'admin',
            tenantId:         'tenant_default',
            codigoParqueadero: codigoNorm || DEFAULT_DEV.codigoParqueadero,
            tipo:             'desarrollador',
          };
        }
      }
    } catch { /* localStorage corrupto */ }

    return null;
  }

  // ── 2. Verificar usuarios clientes independientes (multicuentas) ──
  try {
    const raw      = localStorage.getItem(MPT_KEYS.clientUsers);
    const usuarios = raw ? JSON.parse(raw) : [];

    if (Array.isArray(usuarios)) {
      const match = usuarios.find((u) => {
        if (u.id !== userId) return false;
        if (u.status === 'inactive') return false;
        // Filtrar por tenantId si coincide con el código de parqueadero
        if (codigoNorm && u.tenantId && u.tenantId !== codigoNorm && u.tenantId !== 'tenant_default') return false;
        if (!u.passwordHash) return false;
        return u.passwordHash === password ||
               u.passwordHash.startsWith('demo_') ||
               u.passwordHash.length === 64;
      });

      if (match) {
        return {
          userId:           match.id,
          name:             match.name || `Usuario ${match.id}`,
          role:             match.role || 'operator',
          tenantId:         match.tenantId || codigoNorm || 'tenant_default',
          codigoParqueadero: codigoNorm,
          tipo:             'independiente',
        };
      }
    }
  } catch { /* localStorage corrupto */ }

  return null;
}

// ============================================================
// SUBMIT DEL FORMULARIO DE LOGIN
// ============================================================
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const codigoParqueadero = (codigoParqueaderoInput ? codigoParqueaderoInput.value.trim() : 'PARK001').toUpperCase();
  const userId            = usuarioInput.value.trim();
  const password          = contrasenaInput.value;

  // Validación de formato del usuario (ID numérico)
  if (!USER_PATTERN.test(userId)) {
    showLoginMessage('El usuario debe ser un número de documento (5 a 15 dígitos).');
    usuarioInput.focus();
    return;
  }

  if (!password) {
    showLoginMessage('Ingresa tu contraseña.');
    contrasenaInput.focus();
    return;
  }

  if (!codigoParqueadero) {
    showLoginMessage('Ingresa el código de tu parqueadero.');
    if (codigoParqueaderoInput) codigoParqueaderoInput.focus();
    return;
  }

  showLoginMessage('');

  // Cambiar estado del botón
  const btn = loginForm.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'VERIFICANDO...'; }

  try {
    // ── CAPA 1: Intentar backend JWT ──
    const backendResult = await intentarBackend(codigoParqueadero, userId, password);

    if (backendResult === true) {
      // Backend autenticó exitosamente
      window.location.replace('pages/principal.html');
      return;
    }

    if (backendResult === false) {
      // Backend respondió → credenciales incorrectas (ya se mostró el mensaje)
      contrasenaInput.value = '';
      contrasenaInput.focus();
      return;
    }

    // backendResult === null → backend no disponible, caer a Capa 2

    // ── CAPA 2: Validación local (fallback) ──
    const userData = validarLocal(codigoParqueadero, userId, password);
    if (userData) {
      setLocalSession(userData);
      window.location.replace('pages/principal.html');
      return;
    }

    // Sin coincidencia en ninguna capa
    showLoginMessage('Código de parqueadero, usuario o contraseña incorrectos.');
    contrasenaInput.value = '';
    contrasenaInput.focus();

  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'INGRESAR'; }
  }
});

// ── Solo dígitos en el campo usuario ─────────────────────────
usuarioInput.addEventListener('input', () => {
  usuarioInput.value = usuarioInput.value.replace(/\D/g, '').slice(0, 15);
  showLoginMessage('');
});

// ── Mayúsculas automáticas en código parqueadero ─────────────
if (codigoParqueaderoInput) {
  codigoParqueaderoInput.addEventListener('input', () => {
    const pos = codigoParqueaderoInput.selectionStart;
    codigoParqueaderoInput.value = codigoParqueaderoInput.value.toUpperCase();
    codigoParqueaderoInput.setSelectionRange(pos, pos);
    showLoginMessage('');
  });
}

contrasenaInput.addEventListener('input', () => showLoginMessage(''));
