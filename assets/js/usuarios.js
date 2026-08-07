'use strict';

// Gestión de cuentas exclusiva del SUPERADMIN (desarrollador).
const USERS_API_BASE = window.MPT_API_BASE || '/api';
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const DOCUMENT_RE = /^\d{5,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const form = document.getElementById('userForm');
const fields = {
  name: document.getElementById('userName'),
  document: document.getElementById('userId'),
  email: document.getElementById('userEmail'),
  password: document.getElementById('userPassword'),
  passwordConfirm: document.getElementById('userPasswordConfirm'),
  parkingCode: document.getElementById('parkingCode'),
  parkingName: document.getElementById('parkingName'),
};
const parkingFields = document.getElementById('parkingFields');
const tenantContext = document.getElementById('tenantContext');
const formMessage = document.getElementById('formMsg');
const tableBody = document.getElementById('usersTableBody');
const search = document.getElementById('userSearch');
const toast = document.getElementById('toastNotification');
const toastMessage = document.getElementById('toastMessage');
const deleteModal = document.getElementById('deleteUserModal');
const deleteText = document.getElementById('deleteUserModalText');
const toggleModal = document.getElementById('toggleStatusModal');
const toggleText = document.getElementById('toggleStatusModalText');
const principalAccountPanel = document.getElementById('principalAccountPanel');
const principalDevDocument = document.getElementById('principalDevDocument');
const principalDevEmail = document.getElementById('principalDevEmail');

let users = [];
let pendingId = null;
let pendingAction = null;
let toastTimer = null;

function role() {
  return (sessionStorage.getItem('mptRole') || 'operator').toLowerCase();
}

function isSuperadmin() { return role() === 'superadmin'; }
function canManageUsers() { return isSuperadmin(); }
function isBackendSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem('mptSessionV2') || 'null');
    return Boolean(session && session.token);
  } catch { return false; }
}
function token() {
  try { return JSON.parse(sessionStorage.getItem('mptSessionV2') || '{}').token || ''; }
  catch { return ''; }
}

async function request(path, options = {}) {
  const response = await fetch(`${USERS_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible completar la solicitud.');
  return data;
}

function localUsers() {
  const all = MPTStorage.getUsers();
  // El desarrollador ve las cuentas de todos los clientes en modo local.
  return isSuperadmin() ? all : [];
}

function mapApiUser(user) {
  return {
    id: user.id,
    documento: user.documento,
    nombre: user.nombre,
    email: user.email || '',
    rol: (user.rol || 'OPERADOR').toLowerCase(),
    activo: Boolean(user.activo),
    creado_en: user.creado_en,
    local: false,
  };
}

function mapLocalUser(user) {
  return {
    id: user.id,
    documento: user.id,
    nombre: user.name || `Usuario ${user.id}`,
    email: user.email || '',
    rol: user.role || 'operator',
    activo: user.status !== 'inactive',
    creado_en: user.createdAt,
    local: true,
  };
}

async function hashLocalPassword(value) {
  const data = new TextEncoder().encode(value + '_mpt_salt_parking_v2');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

function showFormMessage(message, type = 'error') {
  formMessage.textContent = message;
  formMessage.className = `usr-form-message msg-${type}`;
}
function showToast(message, type = 'success') {
  clearTimeout(toastTimer);
  toastMessage.textContent = message;
  toast.className = `usr-toast toast-${type}`;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function renderPrincipalAccount() {
  if (!principalAccountPanel) return;
  if (!isSuperadmin()) {
    principalAccountPanel.hidden = true;
    return;
  }

  const developer = MPTStorage.getDeveloperUser();
  principalDevDocument.textContent = developer?.userId || sessionStorage.getItem('mptUser') || '—';
  principalDevEmail.textContent = developer?.email || 'Correo no configurado';
  principalAccountPanel.hidden = false;
}
function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function render() {
  const query = search.value.trim().toLowerCase();
  const visible = users.filter((user) => !query || [user.documento, user.nombre, user.email]
    .some((value) => String(value || '').toLowerCase().includes(query)));
  document.getElementById('statTotalVal').textContent = users.length;
  document.getElementById('statActiveVal').textContent = users.filter((user) => user.activo).length;
  document.getElementById('statDisabledVal').textContent = users.filter((user) => !user.activo).length;

  if (!visible.length) {
    tableBody.innerHTML = '<tr class="usr-empty-row"><td colspan="7">AÚN NO HAY USUARIOS PARA ESTE PARQUEADERO</td></tr>';
    return;
  }
  tableBody.innerHTML = visible.map((user, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><span class="usr-id-cell">${escapeHtml(user.documento)}</span><br><small>${escapeHtml(user.nombre)}</small></td>
      <td><span class="usr-email-cell">${escapeHtml(user.email || '—')}</span></td>
      <td><span class="usr-badge ${user.rol === 'admin' ? 'usr-badge-admin' : 'usr-badge-operator'}">${user.rol === 'admin' ? '★ ADMIN' : 'OPERADOR'}</span></td>
      <td><span class="usr-badge ${user.activo ? 'usr-badge-active' : 'usr-badge-inactive'}">${user.activo ? '● ACTIVO' : '○ INACTIVO'}</span></td>
      <td class="usr-date-cell">${formatDate(user.creado_en)}</td>
      <td><div class="usr-table-actions">
        <button class="usr-action-btn ${user.activo ? 'btn-toggle-active' : 'btn-toggle-inactive'}" data-action="toggle" data-id="${user.id}" title="${user.activo ? 'Desactivar' : 'Activar'} usuario">${user.activo ? '⏻' : '↻'}</button>
        <button class="usr-action-btn btn-delete" data-action="deactivate" data-id="${user.id}" title="Desactivar usuario">⌫</button>
      </div></td>
    </tr>`).join('');
}

async function loadUsers() {
  try {
    users = isBackendSession()
      ? (await request('/usuarios')).usuarios.map(mapApiUser)
      : localUsers().map(mapLocalUser);
    render();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function configureScreen() {
  const label = document.getElementById('roleLabel');
  const title = document.getElementById('formTitle');
  label.textContent = isSuperadmin() ? 'DESARROLLADOR' : role() === 'admin' ? 'ADMINISTRADOR' : 'OPERADOR';
  parkingFields.hidden = !isSuperadmin();
  if (isSuperadmin()) {
    title.textContent = 'CREAR PARQUEADERO Y ADMINISTRADOR';
    tenantContext.textContent = 'Cada alta crea una cuenta independiente: sus usuarios y datos no se comparten con otros parqueaderos.';
    document.querySelector('input[name="userRole"][value="admin"]').checked = true;
    document.querySelectorAll('input[name="userRole"]').forEach((input) => { input.disabled = true; });
  } else {
    form.innerHTML = '<p class="usr-form-message msg-error">No tienes permisos para administrar usuarios.</p>';
  }
  renderPrincipalAccount();
}

function validateForm() {
  const name = fields.name.value.trim();
  const document = fields.document.value.trim();
  const email = fields.email.value.trim().toLowerCase();
  if (!name || name.length < 2) return 'Ingresa el nombre completo del usuario.';
  if (!DOCUMENT_RE.test(document)) return 'El documento debe contener entre 5 y 20 dígitos.';
  if (!EMAIL_RE.test(email)) return 'Ingresa un correo electrónico válido.';
  if (!PASSWORD_RE.test(fields.password.value)) return 'La contraseña debe tener 8 caracteres, mayúscula, número y símbolo.';
  if (fields.password.value !== fields.passwordConfirm.value) return 'Las contraseñas no coinciden.';
  if (isSuperadmin()) {
    if (!/^[A-Z0-9_-]{3,30}$/.test(fields.parkingCode.value.trim().toUpperCase())) return 'El código del parqueadero debe tener 3 a 30 caracteres (A-Z, números, guion o _).';
    if (fields.parkingName.value.trim().length < 3) return 'Ingresa el nombre del parqueadero.';
  }
  return null;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!canManageUsers()) return;
  const validation = validateForm();
  if (validation) return showFormMessage(validation);
  const button = document.getElementById('submitUserBtn');
  button.disabled = true;
  showFormMessage('');
  const selectedRole = document.querySelector('input[name="userRole"]:checked').value;
  try {
    if (isBackendSession()) {
      if (isSuperadmin()) {
        const result = await request('/parqueaderos', {
          method: 'POST',
          body: JSON.stringify({
            codigo: fields.parkingCode.value.trim().toUpperCase(), nombre: fields.parkingName.value.trim(),
            admin_documento: fields.document.value.trim(), admin_nombre: fields.name.value.trim(),
            admin_email: fields.email.value.trim().toLowerCase(), admin_password: fields.password.value,
          }),
        });
        showToast(`Cuenta ${result.parqueadero.codigo} creada. Su administrador ya puede iniciar sesión.`, 'success');
      } else {
        await request('/usuarios', {
          method: 'POST',
          body: JSON.stringify({ nombre: fields.name.value.trim(), documento: fields.document.value.trim(), email: fields.email.value.trim().toLowerCase(), password: fields.password.value, rol: selectedRole.toUpperCase() }),
        });
        showToast('Usuario creado para este parqueadero.', 'success');
      }
    } else {
      const all = MPTStorage.getUsers();
      const tenantId = isSuperadmin()
        ? fields.parkingCode.value.trim().toUpperCase()
        : MPTStorage.getActiveTenantId();
      const tenants = MPTStorage.getTenants();
      if (all.some((user) => user.id === fields.document.value.trim())) {
        throw new Error('Ese documento ya está registrado en el sistema.');
      }
      if (isSuperadmin() && (
        tenants.some((tenant) => tenant.id === tenantId) ||
        all.some((user) => user.tenantId === tenantId)
      )) {
        throw new Error(`El espacio ${tenantId} ya existe. Usa un código de parqueadero diferente.`);
      }
      all.push({
        id: fields.document.value.trim(),
        name: fields.name.value.trim(),
        email: fields.email.value.trim().toLowerCase(),
        passwordHash: await hashLocalPassword(fields.password.value),
        role: isSuperadmin() ? 'admin' : selectedRole,
        status: 'active',
        tenantId,
        createdAt: new Date().toISOString(),
        createdBy: sessionStorage.getItem('mptUser') || 'desarrollador',
      });
      MPTStorage.saveUsers(all);
      if (isSuperadmin()) {
        tenants.push({
          id: tenantId,
          codigo: tenantId,
          nombre: fields.parkingName.value.trim(),
          adminDocumento: fields.document.value.trim(),
          activo: true,
          creadoEn: new Date().toISOString(),
        });
        MPTStorage.saveTenants(tenants);
      }
      showToast(isSuperadmin() ? `Cuenta ${tenantId} creada y guardada localmente.` : 'Usuario creado y guardado localmente.', 'success');
    }
    form.reset();
    if (isSuperadmin()) document.querySelector('input[name="userRole"][value="admin"]').checked = true;
    await loadUsers();
  } catch (error) {
    showFormMessage(error.message || 'No fue posible crear el usuario.');
  } finally {
    button.disabled = false;
  }
});

tableBody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const user = users.find((item) => item.id === button.dataset.id);
  if (!user) return;
  pendingId = user.id;
  pendingAction = button.dataset.action;
  if (pendingAction === 'toggle') {
    document.getElementById('toggleStatusModalTitle').textContent = user.activo ? 'DESACTIVAR USUARIO' : 'ACTIVAR USUARIO';
    toggleText.textContent = `¿Cambiar el estado de ${user.documento}?`;
    toggleModal.hidden = false;
  } else {
    deleteText.textContent = `¿Desactivar al usuario ${user.documento}? Ya no podrá iniciar sesión.`;
    deleteModal.hidden = false;
  }
});

async function applyStatus(active) {
  const user = users.find((item) => item.id === pendingId);
  if (!user) return;
  try {
    if (isBackendSession()) {
      if (active) await request(`/usuarios/${user.id}`, { method: 'PATCH', body: JSON.stringify({ activo: true }) });
      else await request(`/usuarios/${user.id}`, { method: 'DELETE' });
    } else {
      const all = MPTStorage.getUsers().map((item) => (
        item.id === user.id ? { ...item, status: active ? 'active' : 'inactive' } : item
      ));
      MPTStorage.saveUsers(all);
    }
    showToast(`Usuario ${active ? 'activado' : 'desactivado'}.`, active ? 'success' : 'error');
    await loadUsers();
  } catch (error) { showToast(error.message, 'error'); }
}

document.getElementById('confirmToggleStatus').addEventListener('click', async () => {
  const user = users.find((item) => item.id === pendingId);
  toggleModal.hidden = true;
  if (user) await applyStatus(!user.activo);
});
document.getElementById('confirmDeleteUser').addEventListener('click', async () => { deleteModal.hidden = true; await applyStatus(false); });
document.getElementById('cancelToggleStatus').addEventListener('click', () => { toggleModal.hidden = true; });
document.getElementById('cancelDeleteUser').addEventListener('click', () => { deleteModal.hidden = true; });
search.addEventListener('input', render);
fields.document.addEventListener('input', () => { fields.document.value = fields.document.value.replace(/\D/g, '').slice(0, 20); });
fields.parkingCode.addEventListener('input', () => { fields.parkingCode.value = fields.parkingCode.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); });
form.addEventListener('reset', () => { setTimeout(() => showFormMessage(''), 0); });

[['togglePwd', fields.password], ['togglePwdConfirm', fields.passwordConfirm]].forEach(([buttonId, input]) => {
  document.getElementById(buttonId).addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

configureScreen();
loadUsers();
