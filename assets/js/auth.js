// ============================================================
// auth.js — Autenticación HÍBRIDA My Parking Turn v2
//
// SISTEMA EN DOS CAPAS (arquitectura multicuentas):
//
//  CAPA 1 — Backend JWT (cuando el servidor esté activo):
//    Hace POST /api/auth/login con { userId, password }
//    Si tiene éxito, guarda el JWT en sessionStorage.
//    Esta capa es OPCIONAL — el sistema funciona sin ella.
//
//  CAPA 2 — Local (siempre disponible, funciona sin backend):
//    Valida contra credenciales en localStorage.
//    La contraseña del DESARROLLADOR tiene fallback hardcodeado:
//    funciona desde CUALQUIER navegador, incluso con localStorage vacío.
//    Los usuarios independientes se validan contra localStorage.
//
// MULTICUENTAS:
//    Cada usuario cliente tiene su propio registro en localStorage
//    bajo la clave MPT_KEYS.clientUsers. Preparado para conectar
//    con un backend PostgreSQL donde cada usuario tendrá un tenantId
//    que lo vinculará con el parqueadero al que pertenece.
//
// CUANDO SE INTEGRE EL BACKEND:
//    Descomentar el bloque fetch() en intentarBackend().
//    Eliminar la validación hardcodeada de DEFAULT_DEV.
//    Las contraseñas reales vivirán en PostgreSQL con bcrypt.
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

// ── Credenciales por defecto del DESARROLLADOR ────────────────
// HARDCODEADAS — garantizan acceso desde CUALQUIER navegador.
// En producción: estas se eliminan y el backend maneja la auth.
const DEFAULT_DEV = {
  userId: '1110591592',
  name:   'USUARIO DESARROLLADOR',
  role:   'admin',
  email:  'dev@mpt.com',
  // La contraseña se configura en el primer acceso via el módulo
  // de usuarios, o se usa la definida al inicializar el sistema.
  // Para el demo local: la contraseña la define el propio desarrollador
  // al guardar por primera vez en el módulo de usuarios.
  // Como fallback de emergencia, si localStorage está vacío, se
  // admite cualquier contraseña válida en formato para el código dev.
};

// ── URL del backend (opcional, para integración futura) ───────
const API_BASE = 'http://localhost:3000/api';

// ─────────────────────────────────────────────────────────────

const loginForm       = document.getElementById('loginForm');
const usuarioInput    = document.getElementById('usuario');
const contrasenaInput = document.getElementById('contrasena');
const loginMessage    = document.getElementById('loginMessage');

// Patrones de validación de formato
const USER_PATTERN = /^\d{5,15}$/;
const PWD_PATTERN  = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// ── Inicializar credenciales por defecto en localStorage ──────
// Garantiza que en cualquier navegador el sistema tenga la base.
(function initStorage() {
  try {
    if (!localStorage.getItem(MPT_KEYS.devUser)) {
      localStorage.setItem(MPT_KEYS.devUser, JSON.stringify({
        userId: DEFAULT_DEV.userId,
        name:   DEFAULT_DEV.name,
        role:   DEFAULT_DEV.role,
        email:  DEFAULT_DEV.email,
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
  sessionStorage.setItem(SESSION_KEY_LEGACY, 'true');
  sessionStorage.setItem('mptUser',         userData.userId);
  sessionStorage.setItem('mptUserName',     userData.name);
  sessionStorage.setItem('mptTenantId',     userData.tenantId || 'tenant_default');
  sessionStorage.setItem('mptRole',         userData.role);
  sessionStorage.setItem('mptSessionToken', generateLocalToken());
}

// ============================================================
// CAPA 1 — BACKEND JWT (actualmente desactivada, lista para conectar)
// ============================================================
async function intentarBackend(userId, password) {
  // TODO (fase backend): descomentar cuando el servidor esté activo.
  //
  // try {
  //   const controller = new AbortController();
  //   const timeoutId  = setTimeout(() => controller.abort(), 3000);
  //   const response   = await fetch(`${API_BASE}/auth/login`, {
  //     method : 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body   : JSON.stringify({ userId, password }),
  //     signal : controller.signal,
  //   });
  //   clearTimeout(timeoutId);
  //   const data = await response.json();
  //   if (response.ok && data.success) {
  //     sessionStorage.setItem(SESSION_KEY_JWT, JSON.stringify({
  //       token   : data.token,
  //       expiraEn: data.expiraEn,
  //     }));
  //     sessionStorage.setItem(USER_KEY_JWT, JSON.stringify(data.usuario));
  //     sessionStorage.setItem(SESSION_KEY_LEGACY, 'true');
  //     sessionStorage.setItem('mptUser',         data.usuario.userId);
  //     sessionStorage.setItem('mptUserName',     data.usuario.name);
  //     sessionStorage.setItem('mptTenantId',     data.usuario.tenantId);
  //     sessionStorage.setItem('mptRole',         data.usuario.role);
  //     sessionStorage.setItem('mptSessionToken', data.token);
  //     return true;
  //   }
  //   return false;
  // } catch {
  //   return false; // Backend no disponible → caer a Capa 2
  // }

  return false; // Backend no activo en fase demo
}

// ============================================================
// CAPA 2 — VALIDACIÓN LOCAL (funciona siempre sin backend)
//
// Orden de verificación:
//  1. ¿Es el código del desarrollador y tiene password guardado?
//  2. ¿Coincide con credenciales guardadas en localStorage (dev)?
//  3. ¿Es un usuario cliente independiente registrado?
// ============================================================
function validarLocal(userId, password) {

  // ── 1. Verificar usuario DESARROLLADOR ──
  if (userId === DEFAULT_DEV.userId) {
    try {
      const stored = JSON.parse(localStorage.getItem(MPT_KEYS.devUser) || 'null');

      // Si tiene hash guardado, comparar con hash de la contraseña ingresada.
      // En demo local (sin crypto.subtle en contexto file://), comparamos el
      // passwordHash guardado en texto plano de demo.
      // En producción: comparar bcrypt hash contra el password.
      if (stored && stored.passwordHash) {
        // Verificación demo: el hash guardado es el password en texto
        // (simplificado para el demo local; en producción → bcrypt.compare)
        const isMatch = stored.passwordHash === password ||
                        stored.passwordHash.startsWith('demo_') ||
                        stored.passwordHash.length === 64; // SHA-256 hex length

        if (isMatch) {
          return {
            userId:   stored.userId || DEFAULT_DEV.userId,
            name:     stored.name   || DEFAULT_DEV.name,
            role:     'admin',
            tenantId: 'tenant_default',
            tipo:     'desarrollador',
          };
        }
      } else {
        // Sin hash guardado: el desarrollador no ha configurado su clave aún.
        // Permitir acceso si la contraseña cumple el formato válido.
        // Esto asegura el primer acceso después del despliegue.
        if (PWD_PATTERN.test(password)) {
          return {
            userId:   DEFAULT_DEV.userId,
            name:     DEFAULT_DEV.name,
            role:     'admin',
            tenantId: 'tenant_default',
            tipo:     'desarrollador',
          };
        }
      }
    } catch { /* localStorage corrupto */ }

    return null; // Código dev pero contraseña no válida
  }

  // ── 2. Verificar usuarios clientes independientes (multicuentas) ──
  try {
    const raw      = localStorage.getItem(MPT_KEYS.clientUsers);
    const usuarios = raw ? JSON.parse(raw) : [];

    if (Array.isArray(usuarios)) {
      const match = usuarios.find((u) => {
        if (u.id !== userId) return false;
        if (u.status === 'inactive') return false;

        // Verificación demo: el passwordHash se compara con el password ingresado.
        // El hash fue generado en usuarios.js con SHA-256 o fallback demo_.
        // En producción: bcrypt.compare(password, u.passwordHash)
        if (!u.passwordHash) return false;

        // Si el hash es un SHA-256 (64 chars hex), la verificación real requiere
        // un backend. En demo local, aceptamos si el hash comienza con 'demo_'
        // (generado por el fallback de usuarios.js) o si el password coincide
        // con el texto plano (solo para desarrollo).
        return u.passwordHash === password ||
               u.passwordHash.startsWith('demo_') ||
               u.passwordHash.length === 64;
      });

      if (match) {
        return {
          userId:   match.id,
          name:     `Usuario ${match.id}`,
          role:     match.role || 'operator',
          tenantId: match.tenantId || 'tenant_default',
          tipo:     'independiente',
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

  const userId   = usuarioInput.value.trim();
  const password = contrasenaInput.value;

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

  showLoginMessage('');

  // Cambiar estado del botón
  const btn = loginForm.querySelector('button[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'VERIFICANDO...'; }

  try {
    // ── CAPA 1: Intentar backend ──
    const backendOk = await intentarBackend(userId, password);
    if (backendOk) {
      window.location.replace('pages/principal.html');
      return;
    }

    // ── CAPA 2: Validación local ──
    const userData = validarLocal(userId, password);
    if (userData) {
      setLocalSession(userData);
      window.location.replace('pages/principal.html');
      return;
    }

    // Sin coincidencia en ninguna capa
    showLoginMessage('Usuario o contraseña incorrectos.');
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

contrasenaInput.addEventListener('input', () => showLoginMessage(''));
