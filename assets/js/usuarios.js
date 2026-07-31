// ============================================================
// usuarios.js — Módulo de Gestión de Usuarios Independientes
// My Parking Turn v2
//
// PROPÓSITO:
//   Permite al desarrollador/admin crear, listar, activar/
//   desactivar y eliminar usuarios clientes finales.
//
// BASE DE DATOS:
//   Usuarios almacenados en localStorage via MPTStorage.
//   Estructura preparada para conectar con multicuentas
//   (campo tenantId listo para vincular con la cuenta SaaS).
//
// SEGURIDAD:
//   - Las contraseñas NO se almacenan en texto plano.
//   - Se guardan como hash SHA-256 simulado (en frontend demo).
//   - En producción: hash bcrypt en backend PostgreSQL.
//
// CUANDO SE INTEGRE EL BACKEND:
//   Reemplazar MPTStorage.getUsers/saveUsers por fetch() al
//   endpoint REST correspondiente. La estructura de cada
//   usuario definida aquí es compatible con el schema SQL.
// ============================================================

// ── Validaciones ──────────────────────────────────────────────
const PATTERNS = {
  // ID numérico: cédula (5-12), pasaporte (6-15), NIT (9-12)
  userId:   /^[0-9]{5,15}$/,
  email:    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  // Contraseña: mín 8 chars, 1 may, 1 número, 1 especial
  password: /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/,
  // Reglas individuales para el indicador visual
  pwdLength:  /.{8,}/,
  pwdUpper:   /[A-Z]/,
  pwdNumber:  /\d/,
  pwdSpecial: /[^A-Za-z0-9]/,
};

// ── Referencias DOM ───────────────────────────────────────────
const userForm        = document.getElementById("userForm");
const userIdInput     = document.getElementById("userId");
const userEmailInput  = document.getElementById("userEmail");
const pwdInput        = document.getElementById("userPassword");
const pwdConfirmInput = document.getElementById("userPasswordConfirm");
const formMsg         = document.getElementById("formMsg");
const usersTableBody  = document.getElementById("usersTableBody");
const userSearch      = document.getElementById("userSearch");
const strengthBar     = document.getElementById("strengthBar");
const strengthLabel   = document.getElementById("strengthLabel");

// Estadísticas
const statTotalVal    = document.getElementById("statTotalVal");
const statActiveVal   = document.getElementById("statActiveVal");
const statDisabledVal = document.getElementById("statDisabledVal");

// Modales
const deleteUserModal      = document.getElementById("deleteUserModal");
const deleteUserModalText  = document.getElementById("deleteUserModalText");
const cancelDeleteUser     = document.getElementById("cancelDeleteUser");
const confirmDeleteUser    = document.getElementById("confirmDeleteUser");

const toggleStatusModal    = document.getElementById("toggleStatusModal");
const toggleStatusModalText = document.getElementById("toggleStatusModalText");
const cancelToggleStatus   = document.getElementById("cancelToggleStatus");
const confirmToggleStatus  = document.getElementById("confirmToggleStatus");

// Toast
const toastEl      = document.getElementById("toastNotification");
const toastMessage = document.getElementById("toastMessage");

// ── Estado del módulo ─────────────────────────────────────────
let pendingDeleteId  = null;
let pendingToggleId  = null;
let toastTimer       = null;

// ============================================================
// HASH SIMULADO (FRONTEND DEMO)
// En producción: usar bcrypt en backend. Nunca almacenar
// contraseñas en texto plano.
// ============================================================
async function hashPassword(plainText) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plainText + "_mpt_salt_v2");
  try {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray  = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback si crypto.subtle no está disponible (contexto no-HTTPS)
    let hash = 0;
    for (let i = 0; i < plainText.length; i++) {
      hash = ((hash << 5) - hash) + plainText.charCodeAt(i);
      hash |= 0;
    }
    return "demo_" + Math.abs(hash).toString(16);
  }
}

// ============================================================
// STORAGE DE USUARIOS
// Encapsula MPTStorage para el manejo de la base de datos
// de usuarios. Preparado para swap con API REST.
//
// Estructura de cada usuario:
// {
//   id:           string  — ID numérico del documento
//   email:        string  — Correo electrónico
//   passwordHash: string  — Hash de la contraseña
//   role:         string  — "admin" | "operator"
//   status:       string  — "active" | "inactive"
//   tenantId:     string  — PREPARADO para multicuentas SaaS
//   createdAt:    string  — ISO 8601 timestamp
//   createdBy:    string  — ID del usuario que lo creó
// }
// ============================================================
const UsersDB = {
  KEY: "mptClientUsers",

  getAll() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  save(users) {
    localStorage.setItem(this.KEY, JSON.stringify(users));
  },

  findById(id) {
    return this.getAll().find((u) => u.id === id) || null;
  },

  findByEmail(email) {
    return this.getAll().find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    ) || null;
  },

  add(userData) {
    const users = this.getAll();
    users.push(userData);
    this.save(users);
  },

  update(id, changes) {
    const users = this.getAll().map((u) =>
      u.id === id ? { ...u, ...changes } : u
    );
    this.save(users);
  },

  remove(id) {
    const users = this.getAll().filter((u) => u.id !== id);
    this.save(users);
  },

  // ── PREPARADO PARA MULTICUENTAS ──
  // TODO (multicuentas): filtrar por tenantId cuando se implemente
  // getByTenant(tenantId) {
  //   return this.getAll().filter((u) => u.tenantId === tenantId);
  // },
};

// ============================================================
// VALIDACIÓN DE CAMPOS EN TIEMPO REAL
// ============================================================

// ID de documento
userIdInput.addEventListener("input", () => {
  // Solo permite dígitos
  userIdInput.value = userIdInput.value.replace(/\D/g, "").slice(0, 15);
  validateField(
    userIdInput,
    document.getElementById("userIdMsg"),
    PATTERNS.userId.test(userIdInput.value),
    "Debe tener entre 5 y 15 dígitos numéricos"
  );
  clearFormMsg();
});

// Correo
userEmailInput.addEventListener("input", () => {
  validateField(
    userEmailInput,
    document.getElementById("userEmailMsg"),
    PATTERNS.email.test(userEmailInput.value.trim()),
    "Ingresa un correo electrónico válido"
  );
  clearFormMsg();
});

// Contraseña — validación progresiva + fortaleza
pwdInput.addEventListener("input", () => {
  const val = pwdInput.value;
  evaluatePasswordRules(val);
  evaluatePasswordStrength(val);
  // Re-evaluar confirmación si ya fue tocada
  if (pwdConfirmInput.value) {
    validatePasswordMatch();
  }
  clearFormMsg();
});

// Confirmación de contraseña
pwdConfirmInput.addEventListener("input", () => {
  validatePasswordMatch();
  clearFormMsg();
});

// Toggle visibilidad contraseña
document.getElementById("togglePwd").addEventListener("click", () => {
  togglePasswordVisibility(pwdInput, "eyeIcon");
});

document.getElementById("togglePwdConfirm").addEventListener("click", () => {
  togglePasswordVisibility(pwdConfirmInput, "eyeIconConfirm");
});

// Reset del formulario
document.getElementById("resetFormBtn").addEventListener("click", () => {
  resetAllFields();
});

function togglePasswordVisibility(input, iconId) {
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  const icon = document.getElementById(iconId);
  if (isHidden) {
    icon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    `;
  } else {
    icon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    `;
  }
}

function validateField(input, msgEl, isValid, errorMsg) {
  if (input.value === "") {
    input.classList.remove("usr-input-ok", "usr-input-err");
    msgEl.textContent = "";
    msgEl.className = "usr-field-msg";
    return;
  }
  if (isValid) {
    input.classList.add("usr-input-ok");
    input.classList.remove("usr-input-err");
    msgEl.textContent = "✓ Válido";
    msgEl.className = "usr-field-msg usr-msg-ok";
  } else {
    input.classList.add("usr-input-err");
    input.classList.remove("usr-input-ok");
    msgEl.textContent = errorMsg;
    msgEl.className = "usr-field-msg";
  }
}

function evaluatePasswordRules(val) {
  const rules = {
    "req-length":  PATTERNS.pwdLength.test(val),
    "req-upper":   PATTERNS.pwdUpper.test(val),
    "req-number":  PATTERNS.pwdNumber.test(val),
    "req-special": PATTERNS.pwdSpecial.test(val),
  };
  Object.entries(rules).forEach(([id, ok]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("req-ok",   ok);
    el.classList.toggle("req-fail", !ok && val.length > 0);
    // Limpiar si vacío
    if (val.length === 0) {
      el.classList.remove("req-ok", "req-fail");
    }
    // Actualizar ícono (el CSS lo maneja con ::before si está ok/fail)
    const icon = el.querySelector(".usr-pwd-req-icon");
    if (icon) icon.textContent = "";
  });

  // Actualizar estado del input de contraseña
  if (val === "") {
    pwdInput.classList.remove("usr-input-ok", "usr-input-err");
  } else if (PATTERNS.password.test(val)) {
    pwdInput.classList.add("usr-input-ok");
    pwdInput.classList.remove("usr-input-err");
  } else {
    pwdInput.classList.add("usr-input-err");
    pwdInput.classList.remove("usr-input-ok");
  }
}

function evaluatePasswordStrength(val) {
  if (!val) {
    strengthBar.className = "usr-pwd-strength-bar";
    strengthBar.style.width = "0%";
    strengthLabel.textContent = "";
    strengthLabel.style.color = "";
    return;
  }
  let score = 0;
  if (PATTERNS.pwdLength.test(val))  score++;
  if (PATTERNS.pwdUpper.test(val))   score++;
  if (PATTERNS.pwdNumber.test(val))  score++;
  if (PATTERNS.pwdSpecial.test(val)) score++;

  const levels = [
    { cls: "strength-weak",   label: "MUY DÉBIL",  color: "#ef4444" },
    { cls: "strength-fair",   label: "REGULAR",     color: "#d97706" },
    { cls: "strength-good",   label: "BUENA",       color: "#3b82f6" },
    { cls: "strength-strong", label: "FUERTE ✓",    color: "#22c55e" },
  ];
  const level = levels[score - 1] || levels[0];
  strengthBar.className = `usr-pwd-strength-bar ${level.cls}`;
  strengthLabel.textContent = level.label;
  strengthLabel.style.color = level.color;
}

function validatePasswordMatch() {
  const match = pwdInput.value === pwdConfirmInput.value && pwdConfirmInput.value !== "";
  const msgEl = document.getElementById("userPasswordConfirmMsg");
  if (pwdConfirmInput.value === "") {
    pwdConfirmInput.classList.remove("usr-input-ok", "usr-input-err");
    msgEl.textContent = "";
    msgEl.className = "usr-field-msg";
    return;
  }
  if (match) {
    pwdConfirmInput.classList.add("usr-input-ok");
    pwdConfirmInput.classList.remove("usr-input-err");
    msgEl.textContent = "✓ Las contraseñas coinciden";
    msgEl.className = "usr-field-msg usr-msg-ok";
  } else {
    pwdConfirmInput.classList.add("usr-input-err");
    pwdConfirmInput.classList.remove("usr-input-ok");
    msgEl.textContent = "Las contraseñas no coinciden";
    msgEl.className = "usr-field-msg";
  }
}

function clearFormMsg() {
  formMsg.textContent = "";
  formMsg.className = "usr-form-message";
}

function showFormMsg(msg, type = "error") {
  formMsg.textContent = msg;
  formMsg.className = `usr-form-message msg-${type}`;
}

function resetAllFields() {
  userIdInput.classList.remove("usr-input-ok", "usr-input-err");
  userEmailInput.classList.remove("usr-input-ok", "usr-input-err");
  pwdInput.classList.remove("usr-input-ok", "usr-input-err");
  pwdConfirmInput.classList.remove("usr-input-ok", "usr-input-err");

  document.querySelectorAll(".usr-field-msg").forEach((el) => {
    el.textContent = "";
    el.className = "usr-field-msg";
  });
  document.querySelectorAll(".usr-pwd-req").forEach((el) => {
    el.classList.remove("req-ok", "req-fail");
  });

  strengthBar.className = "usr-pwd-strength-bar";
  strengthBar.style.width = "0%";
  strengthLabel.textContent = "";
  strengthLabel.style.color = "";
  clearFormMsg();
}

// ============================================================
// SUBMIT — CREAR USUARIO
// ============================================================
userForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id       = userIdInput.value.trim();
  const email    = userEmailInput.value.trim().toLowerCase();
  const pwd      = pwdInput.value;
  const pwdConf  = pwdConfirmInput.value;
  const roleEl   = userForm.querySelector('input[name="userRole"]:checked');
  const role     = roleEl ? roleEl.value : "operator";

  // ── Validaciones ──
  if (!PATTERNS.userId.test(id)) {
    showFormMsg("El ID/Documento debe tener entre 5 y 15 dígitos numéricos.");
    userIdInput.focus();
    return;
  }

  if (!PATTERNS.email.test(email)) {
    showFormMsg("Ingresa un correo electrónico válido.");
    userEmailInput.focus();
    return;
  }

  if (!PATTERNS.password.test(pwd)) {
    showFormMsg(
      "La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número y un carácter especial."
    );
    pwdInput.focus();
    return;
  }

  if (pwd !== pwdConf) {
    showFormMsg("Las contraseñas no coinciden.");
    pwdConfirmInput.focus();
    return;
  }

  // ── Verificar duplicados ──
  if (UsersDB.findById(id)) {
    showFormMsg(`Ya existe un usuario con el ID ${id}. Cada documento sólo puede registrarse una vez.`);
    userIdInput.focus();
    return;
  }

  if (UsersDB.findByEmail(email)) {
    showFormMsg(`El correo "${email}" ya está registrado en el sistema.`);
    userEmailInput.focus();
    return;
  }

  // ── Crear usuario ──
  const btn = document.getElementById("submitUserBtn");
  btn.disabled = true;
  btn.textContent = "CREANDO…";

  const passwordHash = await hashPassword(pwd);

  // ── TODO (multicuentas): asignar tenantId dinámicamente según
  //    la cuenta SaaS que el desarrollador esté gestionando.
  const newUser = {
    id:           id,
    email:        email,
    passwordHash: passwordHash,
    role:         role,
    status:       "active",
    tenantId:     "tenant_default",  // PREPARADO PARA MULTICUENTAS
    createdAt:    new Date().toISOString(),
    createdBy:    sessionStorage.getItem("mptUser") || "developer",
    // Campos reservados para el sistema multicuenta futuro:
    // assignedParkingId: null,
    // permissions: [],
    // lastLogin: null,
  };

  UsersDB.add(newUser);

  // Limpiar y notificar
  userForm.reset();
  resetAllFields();
  btn.disabled = false;
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="8.5" cy="7" r="4"/>
      <line x1="20" y1="8" x2="20" y2="14"/>
      <line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
    CREAR USUARIO
  `;

  showToast(`✓ Usuario ${id} creado exitosamente`, "success");
  renderUsersTable();
  updateStats();
});

// ============================================================
// RENDERIZADO DE LA TABLA
// ============================================================
function renderUsersTable(filter = "") {
  let users = UsersDB.getAll();

  if (filter) {
    const q = filter.toLowerCase();
    users = users.filter(
      (u) =>
        u.id.includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }

  if (users.length === 0) {
    usersTableBody.innerHTML = `
      <tr class="usr-empty-row">
        <td colspan="7">${filter ? "SIN RESULTADOS PARA LA BÚSQUEDA" : "AÚN NO HAY USUARIOS CREADOS"}</td>
      </tr>
    `;
    return;
  }

  usersTableBody.innerHTML = users
    .map((u, idx) => {
      const isActive = u.status === "active";
      const date = new Date(u.createdAt).toLocaleDateString("es-CO", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });
      const time = new Date(u.createdAt).toLocaleTimeString("es-CO", {
        hour: "2-digit", minute: "2-digit",
      });

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><span class="usr-id-cell">${escHtml(u.id)}</span></td>
          <td><span class="usr-email-cell" title="${escHtml(u.email)}">${escHtml(u.email)}</span></td>
          <td>
            <span class="usr-badge usr-badge-${u.role}">
              ${u.role === "admin" ? "★ ADMIN" : "OPERADOR"}
            </span>
          </td>
          <td>
            <span class="usr-badge ${isActive ? "usr-badge-active" : "usr-badge-inactive"}">
              ${isActive ? "● ACTIVO" : "○ INACTIVO"}
            </span>
          </td>
          <td class="usr-date-cell">${date} ${time}</td>
          <td>
            <div class="usr-table-actions">
              <button
                class="usr-action-btn ${isActive ? "btn-toggle-active" : "btn-toggle-inactive"}"
                data-action="toggle"
                data-id="${escHtml(u.id)}"
                title="${isActive ? "Desactivar usuario" : "Activar usuario"}"
                aria-label="${isActive ? "Desactivar" : "Activar"} usuario ${escHtml(u.id)}"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  ${isActive
                    ? `<path d="M18.36 6.64A9 9 0 1 1 5.64 19.36"/><path d="M12 2v4"/>`
                    : `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`
                  }
                </svg>
              </button>
              <button
                class="usr-action-btn btn-delete"
                data-action="delete"
                data-id="${escHtml(u.id)}"
                title="Eliminar usuario"
                aria-label="Eliminar usuario ${escHtml(u.id)}"
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
        </tr>
      `;
    })
    .join("");
}

// ── Delegación de eventos en la tabla ──
usersTableBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const userId = btn.dataset.id;

  if (action === "delete") {
    pendingDeleteId = userId;
    deleteUserModalText.textContent =
      `¿Seguro que deseas eliminar permanentemente al usuario con ID ${userId}?`;
    deleteUserModal.removeAttribute("hidden");
  }

  if (action === "toggle") {
    const user = UsersDB.findById(userId);
    if (!user) return;
    pendingToggleId = userId;
    const newStatus = user.status === "active" ? "inactivo" : "activo";
    toggleStatusModalText.textContent =
      `¿Cambiar el estado del usuario ${userId} a ${newStatus.toUpperCase()}?`;
    document.getElementById("toggleStatusModalTitle").textContent =
      user.status === "active" ? "DESACTIVAR USUARIO" : "ACTIVAR USUARIO";
    toggleStatusModal.removeAttribute("hidden");
  }
});

// ── Buscador ──
userSearch.addEventListener("input", () => {
  renderUsersTable(userSearch.value.trim());
});

// ============================================================
// MODALES — ELIMINAR
// ============================================================
cancelDeleteUser.addEventListener("click", () => {
  deleteUserModal.setAttribute("hidden", "");
  pendingDeleteId = null;
});

confirmDeleteUser.addEventListener("click", () => {
  if (!pendingDeleteId) return;
  UsersDB.remove(pendingDeleteId);
  deleteUserModal.setAttribute("hidden", "");
  showToast(`Usuario ${pendingDeleteId} eliminado`, "error");
  pendingDeleteId = null;
  renderUsersTable(userSearch.value.trim());
  updateStats();
});

// ── Cerrar modal al hacer clic fuera ──
deleteUserModal.addEventListener("click", (e) => {
  if (e.target === deleteUserModal) {
    deleteUserModal.setAttribute("hidden", "");
    pendingDeleteId = null;
  }
});

// ============================================================
// MODALES — TOGGLE ESTADO
// ============================================================
cancelToggleStatus.addEventListener("click", () => {
  toggleStatusModal.setAttribute("hidden", "");
  pendingToggleId = null;
});

confirmToggleStatus.addEventListener("click", () => {
  if (!pendingToggleId) return;
  const user = UsersDB.findById(pendingToggleId);
  if (!user) return;
  const newStatus = user.status === "active" ? "inactive" : "active";
  UsersDB.update(pendingToggleId, { status: newStatus });
  toggleStatusModal.setAttribute("hidden", "");
  showToast(
    `Usuario ${pendingToggleId} ${newStatus === "active" ? "activado" : "desactivado"}`,
    newStatus === "active" ? "success" : "error"
  );
  pendingToggleId = null;
  renderUsersTable(userSearch.value.trim());
  updateStats();
});

toggleStatusModal.addEventListener("click", (e) => {
  if (e.target === toggleStatusModal) {
    toggleStatusModal.setAttribute("hidden", "");
    pendingToggleId = null;
  }
});

// ============================================================
// ESTADÍSTICAS
// ============================================================
function updateStats() {
  const all      = UsersDB.getAll();
  const active   = all.filter((u) => u.status === "active").length;
  const inactive = all.length - active;

  statTotalVal.textContent    = all.length;
  statActiveVal.textContent   = active;
  statDisabledVal.textContent = inactive;
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = "success") {
  if (toastTimer) clearTimeout(toastTimer);
  toastMessage.textContent = msg;
  toastEl.className = `usr-toast toast-${type}`;
  toastEl.removeAttribute("hidden");
  toastTimer = setTimeout(() => {
    toastEl.setAttribute("hidden", "");
  }, 3500);
}

// ============================================================
// UTILIDADES
// ============================================================
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// INICIALIZACIÓN
// ============================================================
(function init() {
  // Mostrar rol del usuario actual en el header
  const role = sessionStorage.getItem("mptRole") || "admin";
  const roleLabel = document.getElementById("roleLabel");
  if (roleLabel) {
    roleLabel.textContent =
      role === "admin" ? "DESARROLLADOR / ADMIN" : "OPERADOR";
  }

  renderUsersTable();
  updateStats();
})();
