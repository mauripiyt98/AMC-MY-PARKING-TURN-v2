// ============================================================
// usuarios.js — Módulo de Gestión de Usuarios Independientes
// My Parking Turn v2
//
// ARQUITECTURA MULTICUENTAS (sistema híbrido):
//
//  Fase actual (frontend local):
//    Los usuarios se almacenan en localStorage bajo la clave
//    'mptClientUsers'. Cada usuario tiene un tenantId listo
//    para vincular con el parqueadero cliente al que pertenece.
//
//  Fase futura (backend PostgreSQL):
//    Reemplazar UsersDB.getAll/add/update/remove por llamadas
//    fetch() al endpoint REST correspondiente. La estructura
//    de cada usuario aquí definida es compatible con el schema.
//
// SEGURIDAD (contraseñas):
//    Fase demo: SHA-256 vía crypto.subtle (o fallback demo_HASH).
//    Fase backend: bcrypt en el servidor. Nunca texto plano.
//
// FLUJO DE AUTENTICACIÓN (coordinación con auth.js):
//    Cuando un usuario creado aquí inicia sesión en index.html:
//    → auth.js busca en localStorage['mptClientUsers'] por id + passwordHash.
//    → Si coincide y está activo → se establece la sesión local.
//    → En fase backend → auth.js usa fetch() al endpoint JWT.
//
// ESTRUCTURA DE CADA USUARIO:
// {
//   id:           string   — Nº documento (cédula/NIT/pasaporte)
//   email:        string   — Correo para recuperación de contraseña
//   passwordHash: string   — Hash SHA-256 (demo) / bcrypt (producción)
//   role:         string   — 'admin' | 'operator'
//   status:       string   — 'active' | 'inactive'
//   tenantId:     string   — ID del parqueadero cliente (MULTICUENTAS)
//   createdAt:    string   — ISO 8601 timestamp
//   createdBy:    string   — ID del usuario que lo creó
// }
// ============================================================

'use strict';

// ── Patrones de validación ─────────────────────────────────────
const PATTERNS = {
  userId:    /^\d{5,15}$/,
  email:     /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  password:  /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
  pwdLength:  /.{8,}/,
  pwdUpper:   /[A-Z]/,
  pwdNumber:  /\d/,
  pwdSpecial: /[^A-Za-z0-9]/,
};

// ── Clave de localStorage ──────────────────────────────────────
const CLIENT_USERS_KEY = 'mptClientUsers';
const DEV_USER_KEY     = 'mptDeveloperUser';

// ── URL del backend (futuro) ───────────────────────────────────
const API_BASE = 'http://localhost:3000/api';

// ============================================================
// HASH DE CONTRASEÑA
// Demo: SHA-256 via crypto.subtle (funciona en HTTPS y file://)
// Fallback: hash numérico simple si crypto.subtle no está disponible.
// Producción: reemplazar por bcrypt en el backend.
// ============================================================
async function hashPassword(plainText) {
  try {
    const encoder = new TextEncoder();
    const data    = encoder.encode(plainText + '_mpt_salt_parking_v2');
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    const hashArr = Array.from(new Uint8Array(hashBuf));
    return hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // Fallback para contextos sin crypto.subtle
    let h = 0;
    for (let i = 0; i < plainText.length; i++) {
      h = ((h << 5) - h) + plainText.charCodeAt(i);
      h |= 0;
    }
    return 'demo_' + Math.abs(h).toString(16).padStart(8, '0');
  }
}

// ============================================================
// BASE DE DATOS LOCAL DE USUARIOS (CAPA LOCAL)
//
// TODO (fase backend): reemplazar cada método por fetch():
//   getAll()     → GET  /api/usuarios
//   add(user)    → POST /api/usuarios
//   update(id)   → PATCH /api/usuarios/:id
//   remove(id)   → DELETE /api/usuarios/:id
// ============================================================
const UsersDB = {

  getAll() {
    try {
      return JSON.parse(localStorage.getItem(CLIENT_USERS_KEY) || '[]');
    } catch { return []; }
  },

  _save(users) {
    localStorage.setItem(CLIENT_USERS_KEY, JSON.stringify(users));
  },

  findById(id) {
    return this.getAll().find((u) => u.id === id) || null;
  },

  findByEmail(email) {
    return this.getAll().find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    ) || null;
  },

  add(user) {
    const all = this.getAll();
    all.push(user);
    this._save(all);
  },

  update(id, changes) {
    const all = this.getAll().map((u) =>
      u.id === id ? { ...u, ...changes } : u
    );
    this._save(all);
  },

  remove(id) {
    this._save(this.getAll().filter((u) => u.id !== id));
  },

  // ── API BACKEND (futura integración multicuentas) ──────────
  // TODO: cuando el backend esté activo, usar estos métodos
  // async getAllFromApi(token) {
  //   const res = await fetch(`${API_BASE}/usuarios`, {
  //     headers: { Authorization: `Bearer ${token}` }
  //   });
  //   const data = await res.json();
  //   return data.usuarios || [];
  // },
  //
  // async addToApi(token, userData) {
  //   const res = await fetch(`${API_BASE}/usuarios`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  //     body: JSON.stringify(userData),
  //   });
  //   return res.json();
  // },
};

// ── Referencias DOM ────────────────────────────────────────────
const userForm         = document.getElementById('userForm');
const userIdInput      = document.getElementById('userId');
const userEmailInput   = document.getElementById('userEmail');
const pwdInput         = document.getElementById('userPassword');
const pwdConfirmInput  = document.getElementById('userPasswordConfirm');
const formMsg          = document.getElementById('formMsg');
const usersTableBody   = document.getElementById('usersTableBody');
const userSearch       = document.getElementById('userSearch');
const strengthBar      = document.getElementById('strengthBar');
const strengthLabel    = document.getElementById('strengthLabel');

// Estadísticas
const statTotalVal    = document.getElementById('statTotalVal');
const statActiveVal   = document.getElementById('statActiveVal');
const statDisabledVal = document.getElementById('statDisabledVal');

// Modales
const deleteUserModal      = document.getElementById('deleteUserModal');
const deleteUserModalText  = document.getElementById('deleteUserModalText');
const cancelDeleteUser     = document.getElementById('cancelDeleteUser');
const confirmDeleteUser    = document.getElementById('confirmDeleteUser');

const toggleStatusModal     = document.getElementById('toggleStatusModal');
const toggleStatusModalText = document.getElementById('toggleStatusModalText');
const cancelToggleStatus    = document.getElementById('cancelToggleStatus');
const confirmToggleStatus   = document.getElementById('confirmToggleStatus');

// Toast
const toastEl      = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');

// ── Estado interno ─────────────────────────────────────────────
let pendingDeleteId  = null;
let pendingToggleId  = null;
let toastTimer       = null;

// ── Determinar si el usuario actual es admin/desarrollador ─────
function isCurrentUserAdmin() {
  return sessionStorage.getItem('mptRole') === 'admin';
}

// ============================================================
// VALIDACIÓN EN TIEMPO REAL
// ============================================================

userIdInput.addEventListener('input', () => {
  userIdInput.value = userIdInput.value.replace(/\D/g, '').slice(0, 15);
  validateField(
    userIdInput,
    document.getElementById('userIdMsg'),
    PATTERNS.userId.test(userIdInput.value),
    'Debe tener entre 5 y 15 dígitos numéricos'
  );
  clearFormMsg();
});

userEmailInput.addEventListener('input', () => {
  validateField(
    userEmailInput,
    document.getElementById('userEmailMsg'),
    PATTERNS.email.test(userEmailInput.value.trim()),
    'Ingresa un correo electrónico válido'
  );
  clearFormMsg();
});

pwdInput.addEventListener('input', () => {
  evaluatePasswordRules(pwdInput.value);
  evaluatePasswordStrength(pwdInput.value);
  if (pwdConfirmInput.value) validatePasswordMatch();
  clearFormMsg();
});

pwdConfirmInput.addEventListener('input', () => {
  validatePasswordMatch();
  clearFormMsg();
});

// Toggle visibilidad contraseña
document.getElementById('togglePwd').addEventListener('click', () => {
  togglePwdVisibility(pwdInput, 'eyeIcon');
});
document.getElementById('togglePwdConfirm').addEventListener('click', () => {
  togglePwdVisibility(pwdConfirmInput, 'eyeIconConfirm');
});

document.getElementById('resetFormBtn').addEventListener('click', () => resetAllFields());

// ── Helpers de validación ──────────────────────────────────────
function validateField(input, msgEl, isValid, errorMsg) {
  if (!input.value) {
    input.classList.remove('usr-input-ok', 'usr-input-err');
    if (msgEl) { msgEl.textContent = ''; msgEl.className = 'usr-field-msg'; }
    return;
  }
  if (isValid) {
    input.classList.add('usr-input-ok');
    input.classList.remove('usr-input-err');
    if (msgEl) { msgEl.textContent = '✓ Válido'; msgEl.className = 'usr-field-msg usr-msg-ok'; }
  } else {
    input.classList.add('usr-input-err');
    input.classList.remove('usr-input-ok');
    if (msgEl) { msgEl.textContent = errorMsg; msgEl.className = 'usr-field-msg'; }
  }
}

function evaluatePasswordRules(val) {
  const rules = {
    'req-length':  PATTERNS.pwdLength.test(val),
    'req-upper':   PATTERNS.pwdUpper.test(val),
    'req-number':  PATTERNS.pwdNumber.test(val),
    'req-special': PATTERNS.pwdSpecial.test(val),
  };
  Object.entries(rules).forEach(([id, ok]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('req-ok',   ok);
    el.classList.toggle('req-fail', !ok && val.length > 0);
    if (!val) el.classList.remove('req-ok', 'req-fail');
  });
  if (!val) {
    pwdInput.classList.remove('usr-input-ok', 'usr-input-err');
  } else if (PATTERNS.password.test(val)) {
    pwdInput.classList.add('usr-input-ok');
    pwdInput.classList.remove('usr-input-err');
  } else {
    pwdInput.classList.add('usr-input-err');
    pwdInput.classList.remove('usr-input-ok');
  }
}

function evaluatePasswordStrength(val) {
  if (!val) {
    strengthBar.className = 'usr-pwd-strength-bar';
    strengthLabel.textContent = '';
    strengthLabel.style.color = '';
    return;
  }
  let score = 0;
  if (PATTERNS.pwdLength.test(val))  score++;
  if (PATTERNS.pwdUpper.test(val))   score++;
  if (PATTERNS.pwdNumber.test(val))  score++;
  if (PATTERNS.pwdSpecial.test(val)) score++;

  const levels = [
    { cls: 'strength-weak',   label: 'MUY DÉBIL',  color: '#ef4444' },
    { cls: 'strength-fair',   label: 'REGULAR',     color: '#d97706' },
    { cls: 'strength-good',   label: 'BUENA',       color: '#3b82f6' },
    { cls: 'strength-strong', label: 'FUERTE ✓',    color: '#22c55e' },
  ];
  const level = levels[score - 1] || levels[0];
  strengthBar.className = `usr-pwd-strength-bar ${level.cls}`;
  strengthLabel.textContent = level.label;
  strengthLabel.style.color = level.color;
}

function validatePasswordMatch() {
  const match  = pwdInput.value === pwdConfirmInput.value && pwdConfirmInput.value !== '';
  const msgEl  = document.getElementById('userPasswordConfirmMsg');
  if (!pwdConfirmInput.value) {
    pwdConfirmInput.classList.remove('usr-input-ok', 'usr-input-err');
    if (msgEl) { msgEl.textContent = ''; msgEl.className = 'usr-field-msg'; }
    return;
  }
  if (match) {
    pwdConfirmInput.classList.add('usr-input-ok');
    pwdConfirmInput.classList.remove('usr-input-err');
    if (msgEl) { msgEl.textContent = '✓ Las contraseñas coinciden'; msgEl.className = 'usr-field-msg usr-msg-ok'; }
  } else {
    pwdConfirmInput.classList.add('usr-input-err');
    pwdConfirmInput.classList.remove('usr-input-ok');
    if (msgEl) { msgEl.textContent = 'Las contraseñas no coinciden'; msgEl.className = 'usr-field-msg'; }
  }
}

function togglePwdVisibility(input, iconId) {
  const hidden = input.type === 'password';
  input.type = hidden ? 'text' : 'password';
  const icon = document.getElementById(iconId);
  if (!icon) return;
  icon.innerHTML = hidden
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`;
}

function clearFormMsg() {
  formMsg.textContent = '';
  formMsg.className = 'usr-form-message';
}

function showFormMsg(msg, type = 'error') {
  formMsg.textContent = msg;
  formMsg.className = `usr-form-message msg-${type}`;
}

function resetAllFields() {
  ['userId', 'userEmail', 'userPassword', 'userPasswordConfirm'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('usr-input-ok', 'usr-input-err');
  });
  document.querySelectorAll('.usr-field-msg').forEach((el) => {
    el.textContent = ''; el.className = 'usr-field-msg';
  });
  document.querySelectorAll('.usr-pwd-req').forEach((el) =>
    el.classList.remove('req-ok', 'req-fail')
  );
  strengthBar.className = 'usr-pwd-strength-bar';
  strengthLabel.textContent = '';
  strengthLabel.style.color = '';
  clearFormMsg();
}

// ============================================================
// SUBMIT — CREAR USUARIO INDEPENDIENTE
// ============================================================
userForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id      = userIdInput.value.trim();
  const email   = userEmailInput.value.trim().toLowerCase();
  const pwd     = pwdInput.value;
  const pwdConf = pwdConfirmInput.value;
  const roleEl  = userForm.querySelector('input[name="userRole"]:checked');
  const role    = roleEl ? roleEl.value : 'operator';

  // ── Validaciones de formato ──
  if (!PATTERNS.userId.test(id)) {
    showFormMsg('El ID/Documento debe tener entre 5 y 15 dígitos numéricos.');
    userIdInput.focus(); return;
  }
  if (!PATTERNS.email.test(email)) {
    showFormMsg('Ingresa un correo electrónico válido.');
    userEmailInput.focus(); return;
  }
  if (!PATTERNS.password.test(pwd)) {
    showFormMsg('La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial.');
    pwdInput.focus(); return;
  }
  if (pwd !== pwdConf) {
    showFormMsg('Las contraseñas no coinciden.');
    pwdConfirmInput.focus(); return;
  }

  // ── Verificar que no sea el código del desarrollador ──
  const devUser = (() => {
    try { return JSON.parse(localStorage.getItem(DEV_USER_KEY) || 'null'); } catch { return null; }
  })();
  if (devUser && devUser.userId === id) {
    showFormMsg(`El ID ${id} pertenece al Desarrollador del sistema. No puede registrarse como usuario independiente.`);
    userIdInput.focus(); return;
  }

  // ── Verificar duplicados ──
  if (UsersDB.findById(id)) {
    showFormMsg(`Ya existe un usuario con el ID ${id}. Cada documento se registra una sola vez.`);
    userIdInput.focus(); return;
  }
  if (UsersDB.findByEmail(email)) {
    showFormMsg(`El correo "${email}" ya está registrado en el sistema.`);
    userEmailInput.focus(); return;
  }

  // ── Crear el usuario ──
  const btn = document.getElementById('submitUserBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'CREANDO...'; }

  const passwordHash = await hashPassword(pwd);

  // ── TODO (MULTICUENTAS): cuando se implemente el sistema de
  //    parqueaderos múltiples, asignar aquí el tenantId del
  //    parqueadero al que pertenecerá este usuario.
  //    Por ahora todos van a 'tenant_default'.
  const newUser = {
    id,
    email,
    passwordHash,
    role,
    status:    'active',
    tenantId:  'tenant_default',   // ← PREPARADO PARA MULTICUENTAS
    createdAt: new Date().toISOString(),
    createdBy: sessionStorage.getItem('mptUser') || 'developer',
    // Campos reservados para multicuentas:
    // assignedParkingId: null,  // ID del parqueadero asignado
    // permissions: [],          // Permisos específicos
    // lastLogin: null,          // Último acceso
  };

  // ── FASE LOCAL: guardar en localStorage ──
  UsersDB.add(newUser);

  // ── TODO (fase backend): crear via API ──
  // try {
  //   const token = JSON.parse(sessionStorage.getItem('mptSessionV2') || '{}').token;
  //   await fetch(`${API_BASE}/usuarios`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  //     body: JSON.stringify(newUser),
  //   });
  // } catch (err) {
  //   console.warn('Error al guardar en backend, guardado localmente:', err);
  // }

  userForm.reset();
  resetAllFields();
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8" x2="20" y2="14"/>
      <line x1="23" y1="11" x2="17" y2="11"/>
    </svg>CREAR USUARIO`;
  }

  showToast(`✓ Usuario ${id} creado. Ya puede iniciar sesión.`, 'success');
  renderTable();
  updateStats();
});

// ============================================================
// RENDERIZADO DE LA TABLA
// ============================================================
function renderTable(filter = '') {
  let users = UsersDB.getAll();

  if (filter) {
    const q = filter.toLowerCase();
    users = users.filter((u) =>
      u.id.includes(q) || u.email.toLowerCase().includes(q)
    );
  }

  if (!users.length) {
    usersTableBody.innerHTML = `
      <tr class="usr-empty-row">
        <td colspan="7">${filter ? 'SIN RESULTADOS PARA LA BÚSQUEDA' : 'AÚN NO HAY USUARIOS CREADOS'}</td>
      </tr>`;
    return;
  }

  usersTableBody.innerHTML = users.map((u, i) => {
    const active = u.status === 'active';
    const date   = new Date(u.createdAt).toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    const time   = new Date(u.createdAt).toLocaleTimeString('es-CO', {
      hour: '2-digit', minute: '2-digit',
    });

    return `
      <tr>
        <td>${i + 1}</td>
        <td><span class="usr-id-cell">${esc(u.id)}</span></td>
        <td><span class="usr-email-cell" title="${esc(u.email)}">${esc(u.email)}</span></td>
        <td>
          <span class="usr-badge ${u.role === 'admin' ? 'usr-badge-admin' : 'usr-badge-operator'}">
            ${u.role === 'admin' ? '★ ADMIN' : 'OPERADOR'}
          </span>
        </td>
        <td>
          <span class="usr-badge ${active ? 'usr-badge-active' : 'usr-badge-inactive'}">
            ${active ? '● ACTIVO' : '○ INACTIVO'}
          </span>
        </td>
        <td class="usr-date-cell">${date} ${time}</td>
        <td>
          <div class="usr-table-actions">
            <button
              class="usr-action-btn ${active ? 'btn-toggle-active' : 'btn-toggle-inactive'}"
              data-action="toggle" data-id="${esc(u.id)}"
              title="${active ? 'Desactivar' : 'Activar'} usuario"
              aria-label="${active ? 'Desactivar' : 'Activar'} usuario ${esc(u.id)}"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                ${active
                  ? `<path d="M18.36 6.64A9 9 0 1 1 5.64 19.36"/><path d="M12 2v4"/>`
                  : `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`
                }
              </svg>
            </button>
            <button
              class="usr-action-btn btn-delete"
              data-action="delete" data-id="${esc(u.id)}"
              title="Eliminar usuario"
              aria-label="Eliminar usuario ${esc(u.id)}"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

// ── Delegación de eventos en tabla ────────────────────────────
usersTableBody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const { action, id } = btn.dataset;

  if (action === 'delete') {
    pendingDeleteId = id;
    deleteUserModalText.textContent =
      `¿Seguro que deseas eliminar permanentemente al usuario con ID ${id}?`;
    deleteUserModal.removeAttribute('hidden');
  }

  if (action === 'toggle') {
    const user = UsersDB.findById(id);
    if (!user) return;
    pendingToggleId = id;
    const nuevoEstado = user.status === 'active' ? 'INACTIVO' : 'ACTIVO';
    document.getElementById('toggleStatusModalTitle').textContent =
      user.status === 'active' ? 'DESACTIVAR USUARIO' : 'ACTIVAR USUARIO';
    toggleStatusModalText.textContent =
      `¿Cambiar el estado del usuario ${id} a ${nuevoEstado}?`;
    toggleStatusModal.removeAttribute('hidden');
  }
});

// ── Búsqueda en tabla ─────────────────────────────────────────
userSearch.addEventListener('input', () => renderTable(userSearch.value.trim()));

// ============================================================
// MODALES
// ============================================================

// ── Eliminar ──
cancelDeleteUser.addEventListener('click', () => {
  deleteUserModal.setAttribute('hidden', '');
  pendingDeleteId = null;
});

confirmDeleteUser.addEventListener('click', () => {
  if (!pendingDeleteId) return;

  // TODO (backend): DELETE /api/usuarios/:id con fetch()
  UsersDB.remove(pendingDeleteId);
  deleteUserModal.setAttribute('hidden', '');
  showToast(`Usuario ${pendingDeleteId} eliminado`, 'error');
  pendingDeleteId = null;
  renderTable(userSearch.value.trim());
  updateStats();
});

deleteUserModal.addEventListener('click', (e) => {
  if (e.target === deleteUserModal) {
    deleteUserModal.setAttribute('hidden', '');
    pendingDeleteId = null;
  }
});

// ── Toggle estado ──
cancelToggleStatus.addEventListener('click', () => {
  toggleStatusModal.setAttribute('hidden', '');
  pendingToggleId = null;
});

confirmToggleStatus.addEventListener('click', () => {
  if (!pendingToggleId) return;
  const user = UsersDB.findById(pendingToggleId);
  if (!user) return;
  const newStatus = user.status === 'active' ? 'inactive' : 'active';

  // TODO (backend): PATCH /api/usuarios/:id con fetch()
  UsersDB.update(pendingToggleId, { status: newStatus });
  toggleStatusModal.setAttribute('hidden', '');
  showToast(
    `Usuario ${pendingToggleId} ${newStatus === 'active' ? 'activado' : 'desactivado'}`,
    newStatus === 'active' ? 'success' : 'error'
  );
  pendingToggleId = null;
  renderTable(userSearch.value.trim());
  updateStats();
});

toggleStatusModal.addEventListener('click', (e) => {
  if (e.target === toggleStatusModal) {
    toggleStatusModal.setAttribute('hidden', '');
    pendingToggleId = null;
  }
});

// ============================================================
// ESTADÍSTICAS
// ============================================================
function updateStats() {
  const all      = UsersDB.getAll();
  const active   = all.filter((u) => u.status === 'active').length;
  const inactive = all.length - active;
  if (statTotalVal)    statTotalVal.textContent    = all.length;
  if (statActiveVal)   statActiveVal.textContent   = active;
  if (statDisabledVal) statDisabledVal.textContent = inactive;
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'success') {
  if (toastTimer) clearTimeout(toastTimer);
  toastMessage.textContent = msg;
  toastEl.className = `usr-toast toast-${type}`;
  toastEl.removeAttribute('hidden');
  toastTimer = setTimeout(() => toastEl.setAttribute('hidden', ''), 3500);
}

// ── Escape HTML ───────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
(function init() {
  // Mostrar rol en el header
  const role      = sessionStorage.getItem('mptRole') || 'admin';
  const roleLabel = document.getElementById('roleLabel');
  if (roleLabel) {
    roleLabel.textContent = role === 'admin' ? 'DESARROLLADOR / ADMIN' : 'OPERADOR';
  }

  // Si no es admin, restringir acceso a la creación de usuarios
  if (!isCurrentUserAdmin()) {
    const formPanel = document.querySelector('.usr-form-panel');
    if (formPanel) {
      formPanel.innerHTML = `
        <div style="text-align:center; padding: 40px 20px; color: rgba(255,255,255,0.5);">
          <p style="font-size:14px; font-weight:800;">ACCESO RESTRINGIDO</p>
          <p style="font-size:12px; margin-top:8px;">Solo el Desarrollador / Administrador puede gestionar usuarios.</p>
        </div>`;
    }
  }

  renderTable();
  updateStats();
})();
