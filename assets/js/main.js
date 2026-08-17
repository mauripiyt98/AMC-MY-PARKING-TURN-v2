// ============================================================
// main.js — Logica de turnos por horas
// My Parking Turn v2
//
// Dependencias (cargadas antes en el HTML):
//   1. session-guard.js  — proteccion de ruta
//   2. storage.js        — capa de datos SaaS
// ============================================================

// ===== Referencias DOM =====
const entryDateTime        = document.querySelector("#entryDateTime");
const plateForm            = document.querySelector("#plateForm");
const placaInput           = document.querySelector("#placa");
const plateMessage         = document.querySelector("#plateMessage");
const vehicleTypeInputs    = document.querySelectorAll('input[name="vehicleType"]');
const activePlateFilterInput = document.querySelector("#activePlateFilter");
const recordsBody          = document.querySelector("#recordsBody");
const exitModal            = document.querySelector("#exitModal");
const exitModalText        = document.querySelector("#exitModalText");
const cancelExit           = document.querySelector("#cancelExit");
const confirmExit          = document.querySelector("#confirmExit");
const chargeModal          = document.querySelector("#chargeModal");
const chargePlate          = document.querySelector("#chargePlate");
const chargeDate           = document.querySelector("#chargeDate");
const chargeEntryTime      = document.querySelector("#chargeEntryTime");
const chargeExitTime       = document.querySelector("#chargeExitTime");
const chargeTotal          = document.querySelector("#chargeTotal");
const closeCharge          = document.querySelector("#closeCharge");
const generatePdfButton    = document.querySelector("#generatePdfButton");
const ticketPreviewModal   = document.querySelector("#ticketPreviewModal");
const ticketPreviewDetails = document.querySelector("#ticketPreviewDetails");
const closeTicketPreview   = document.querySelector("#closeTicketPreview");
const deleteModal          = document.querySelector("#deleteModal");
const deleteForm           = document.querySelector("#deleteForm");
const developerPasswordInput = document.querySelector("#developerPassword");
const deleteMessage        = document.querySelector("#deleteMessage");
const cancelDelete         = document.querySelector("#cancelDelete");
const logoutButton         = document.querySelector("#logoutButton");
const manageUsersLink      = document.querySelector("#btnGestionUsuarios");
const welcomeMessage       = document.querySelector("#welcomeMessage");
const operatorModal        = document.querySelector("#operatorModal");
const chooseOperatorButton = document.querySelector("#chooseOperatorButton");
const closeOperatorButton  = document.querySelector("#closeOperatorButton");
const activeOperatorName   = document.querySelector("#activeOperatorName");
const activeOperatorState  = document.querySelector("#activeOperatorState");
const operatorOptions      = document.querySelector("#operatorOptions");
const operatorCodeForm     = document.querySelector("#operatorCodeForm");
const operatorCodeInput    = document.querySelector("#operatorCodeInput");
const operatorModalMessage = document.querySelector("#operatorModalMessage");
const selectedOperatorLabel = document.querySelector("#selectedOperatorLabel");
const operatorCodeLabel    = document.querySelector("#operatorCodeLabel");


// ===== Estado local =====
let pendingExitIndex = null;
let pendingDelete    = null;
let pendingOperator = null;
let pendingPdfTicket = null;

async function renderWelcomeMessage() {
  if (!welcomeMessage) return;

  const profile = MPTStorage.getParkingProfile() || {};
  let commercialName = String(profile?.nombreComercial || '').trim();

  if (MPTStorage.hasJwtSession()) {
    try {
      const tenantId = MPTStorage.getActiveTenantId();

      if (tenantId) {
        const data = await MPTStorage.apiRequest(
          `/parqueaderos/${encodeURIComponent(tenantId)}`
        );

        const serverName = String(data?.parqueadero?.nombre || '').trim();

        if (serverName) {
          commercialName = serverName;

          MPTStorage.saveParkingProfile({
            ...profile,
            nombreComercial: serverName,
          });
        }
      }
    } catch (error) {
      console.warn('[MPT] No se pudo sincronizar el nombre del parqueadero:', error.message);
    }
  }

  welcomeMessage.textContent = commercialName
    ? `BIENVENIDO ${commercialName.toUpperCase()}`
    : 'BIENVENIDO';
}

function getSelectedOperator() {
  return MPTStorage.getActiveOperator ? MPTStorage.getActiveOperator() : null;
}

function renderOperatorStatus() {
  const operator = getSelectedOperator();
  const active = Boolean(operator);
  const operatorOnly = active && operator.tipo === 'OPERADOR';
  activeOperatorName.textContent = active ? operator.nombre : 'ESCOGER OPERADOR';
  activeOperatorState.textContent = active ? '🟢 ACTIVO' : 'SIN OPERADOR ACTIVO';
  closeOperatorButton.hidden = !active;
  chooseOperatorButton.hidden = active;
  document.body.classList.toggle('operator-locked', !active);
  [...plateForm.elements].forEach((element) => { element.disabled = !active; });
  document.querySelectorAll('.exit-action, .delete-action').forEach((button) => { button.disabled = !active; });
  document.querySelector('.operator-status')?.classList.toggle('is-active', active);
  document.querySelectorAll('.profile-action, .side-module, .side-actions').forEach((element) => { element.hidden = operatorOnly; });
  if (manageUsersLink) manageUsersLink.hidden = operatorOnly || MPTStorage.getActiveUserRole() !== 'superadmin';
}

function showOperatorCodeForm(operator) {
  pendingOperator = operator;
  operatorOptions.hidden = true;
  operatorCodeForm.hidden = false;
  operatorModalMessage.textContent = '';
  selectedOperatorLabel.textContent = operator.tipo === 'PRINCIPAL' ? 'OPERADOR PRINCIPAL' : operator.nombre;
  operatorCodeLabel.textContent = operator.tipo === 'PRINCIPAL' ? 'CLAVE DEL OPERADOR PRINCIPAL' : 'CÓDIGO DEL OPERADOR';
  operatorCodeInput.value = '';
  operatorCodeInput.focus();
}

async function openOperatorModal() {
  pendingOperator = null;
  operatorCodeForm.hidden = true;
  operatorOptions.hidden = false;
  operatorOptions.innerHTML = '<p>CARGANDO OPERADORES…</p>';
  operatorModal.hidden = false;
  try {
    const data = await MPTStorage.apiRequest('/auth/operadores');
    const options = [{ id: null, nombre: 'OPERADOR PRINCIPAL', tipo: 'PRINCIPAL' }, ...(data.operadores || []).map((operator) => ({ ...operator, tipo: 'OPERADOR' }))];
    operatorOptions.innerHTML = options.map((operator, index) => `<button type="button" data-operator-index="${index}">${operator.nombre}</button>`).join('') || '<p>NO HAY OPERADORES CREADOS.</p>';
    operatorOptions.onclick = (event) => {
      const button = event.target.closest('[data-operator-index]');
      if (button) showOperatorCodeForm(options[Number(button.dataset.operatorIndex)]);
    };
  } catch (error) {
    operatorOptions.innerHTML = `<p>${error.message}</p>`;
  }
}

// ============================================================
// UTILIDADES DE FORMATO
// ============================================================

function formatDateTime(date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("es-CO", {
    timeStyle: "medium",
  }).format(date);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizePlate(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function formatTicket(ticketNumber) {
  return `TICKET ${ticketNumber}`;
}

function formatSelectorPrice(value) {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

function renderConfiguredPrices() {
  const prices = MPTStorage.getParkingPrices();
  vehicleTypeInputs.forEach((input) => {
    const price = prices[input.value];
    if (!Number.isFinite(price)) return;
    input.dataset.price = String(price);
    const label = input.nextElementSibling;
    if (label) label.textContent = `PRECIO ${input.dataset.label} $${formatSelectorPrice(price)}`;
  });
}

async function syncConfiguredPricesFromServer() {
  if (!MPTStorage.hasJwtSession()) return;

  try {
    const tenantId = MPTStorage.getActiveTenantId();
    const token = MPTStorage.getSessionToken();
    const response = await fetch(`${window.MPT_API_BASE || '/api'}/parqueaderos/${tenantId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    const prices = data.parqueadero;
    if (!response.ok || !data.success || !prices) return;
    if (!Number.isInteger(prices.tarifa_moto_hora) || !Number.isInteger(prices.tarifa_carro_hora)) return;
    MPTStorage.saveParkingPrices({ moto: prices.tarifa_moto_hora, carro: prices.tarifa_carro_hora });
    renderConfiguredPrices();
  } catch {
    // El modo local sigue operativo si el servidor no está disponible.
  }
}

// ============================================================
// SELECCION DE VEHICULO
// ============================================================

function getSelectedVehicle() {
  const selectedVehicle = [...vehicleTypeInputs].find((input) => input.checked);

  if (!selectedVehicle) {
    return null;
  }

  return {
    type:  selectedVehicle.dataset.label,
    price: Number(selectedVehicle.dataset.price),
  };
}

// ============================================================
// CALCULO DE COBRO
// ============================================================

function getChargedHours(entryIso, exitDate) {
  const entryDate = new Date(entryIso);

  if (Number.isNaN(entryDate.getTime())) {
    return 1;
  }

  const elapsedMilliseconds = Math.max(0, exitDate - entryDate);
  const elapsedHours = Math.floor(elapsedMilliseconds / 3600000);

  return elapsedHours + 1;
}

function getExitCharge(record, exitDate) {
  const chargedHours = getChargedHours(record.entryIso, exitDate);
  const hourlyPrice  = Number(record.hourlyPrice || 0);

  return {
    chargedHours,
    hourlyPrice,
    totalCharged: chargedHours * hourlyPrice,
  };
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function updateLiveCharges() {
  const chargeCells = document.querySelectorAll(".live-charge-cell");
  const hoursCells  = document.querySelectorAll(".live-hours-cell");
  if (!chargeCells.length) return;
  const records = MPTStorage.getRecords();
  const now = new Date();
  chargeCells.forEach((cell, i) => {
    const index = Number(cell.dataset.index);
    const record = records[index];
    if (record) {
      const { chargedHours, totalCharged } = getExitCharge(record, now);
      cell.textContent = formatCurrency(totalCharged);
      if (hoursCells[i]) {
        hoursCells[i].textContent = chargedHours;
      }
    }
  });
}

// ============================================================
// NUMERACION DE TICKETS
// ============================================================

function getHighestTicketNumber(records, history) {
  return [...records, ...history].reduce((highestTicket, record) => {
    const ticketNumber = Number(record.ticketNumber || 0);

    if (!Number.isInteger(ticketNumber)) {
      return highestTicket;
    }

    return Math.max(highestTicket, ticketNumber);
  }, 0);
}

function migrateTicketNumbers() {
  const records = MPTStorage.getRecords();
  const history = MPTStorage.getHistory();
  let nextTicketNumber = Math.max(
    MPTStorage.getStoredNextTicketNumber(),
    getHighestTicketNumber(records, history) + 1
  );
  let didUpdateRecords = false;
  let didUpdateHistory = false;

  [...history].reverse().forEach((record) => {
    if (Number.isInteger(Number(record.ticketNumber)) && Number(record.ticketNumber) > 0) {
      record.ticketNumber = Number(record.ticketNumber);
      return;
    }

    record.ticketNumber = nextTicketNumber;
    nextTicketNumber += 1;
    didUpdateHistory = true;
  });

  [...records].reverse().forEach((record) => {
    if (Number.isInteger(Number(record.ticketNumber)) && Number(record.ticketNumber) > 0) {
      record.ticketNumber = Number(record.ticketNumber);
      return;
    }

    record.ticketNumber = nextTicketNumber;
    nextTicketNumber += 1;
    didUpdateRecords = true;
  });

  if (didUpdateRecords) {
    MPTStorage.saveRecords(records);
  }

  if (didUpdateHistory) {
    MPTStorage.saveHistory(history);
  }

  MPTStorage.saveNextTicketNumber(
    Math.max(nextTicketNumber, getHighestTicketNumber(records, history) + 1)
  );
}

function getNextTicketNumber() {
  const records = MPTStorage.getRecords();
  const history = MPTStorage.getHistory();
  const nextTicketNumber = Math.max(
    MPTStorage.getStoredNextTicketNumber(),
    getHighestTicketNumber(records, history) + 1
  );

  MPTStorage.saveNextTicketNumber(nextTicketNumber + 1);
  return nextTicketNumber;
}

// ============================================================
// RENDER DE TURNOS ACTIVOS
// ============================================================

function renderRecords() {
  const records     = MPTStorage.getRecords();
  const plateFilter = activePlateFilterInput.value.trim().toUpperCase();
  const filteredRecords = plateFilter
    ? records
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => normalizePlate(record.plate).includes(plateFilter))
    : records.map((record, index) => ({ record, index }));

  recordsBody.innerHTML = "";

  if (records.length === 0) {
    recordsBody.innerHTML = '<tr class="empty-record"><td colspan="12">AUN NO HAY TURNOS REGISTRADOS</td></tr>';
    return;
  }

  if (filteredRecords.length === 0) {
    recordsBody.innerHTML = '<tr class="empty-record"><td colspan="12">NO HAY TURNOS ACTIVOS PARA ESA PLACA</td></tr>';
    return;
  }

  filteredRecords.forEach(({ record, index }) => {
    const hourlyPrice = Number(record.hourlyPrice || 0);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatTicket(record.ticketNumber)}</td>
      <td>${record.plate}</td>
      <td>${record.date}</td>
      <td>${record.time}</td>
      <td>${record.vehicleType || "SIN DEFINIR"}</td>
      <td>${formatCurrency(hourlyPrice)}</td>
      <td class="live-charge-cell" data-index="${index}"></td>
      <td class="live-hours-cell" data-index="${index}"></td>
      <td>${record.user}</td>
      <td><button class="ticket-preview-action" type="button" data-index="${index}" aria-label="Ver ticket ${escapeHtml(record.ticketNumber)}">VER</button></td>
      <td><button class="exit-action" type="button" data-index="${index}">SALIDA</button></td>
      <td><button class="delete-action" type="button" data-type="active" data-index="${index}">ELIMINAR</button></td>
    `;
    recordsBody.appendChild(row);
  });
  updateLiveCharges();
}

function openActiveTicketPreview(record) {
  const { chargedHours, totalCharged } = getExitCharge(record, new Date());
  const details = [
    ['TICKET', formatTicket(record.ticketNumber)], ['PLACA', record.plate],
    ['VEHICULO', record.vehicleType || 'SIN DEFINIR'], ['FECHA INGRESO', record.date],
    ['HORA INGRESO', record.time], ['TARIFA POR HORA', formatCurrency(record.hourlyPrice)],
    ['HORAS ACTUALES', chargedHours], ['VALOR ACTUAL', formatCurrency(totalCharged)],
    ['OPERADOR', record.user || 'SIN DATO'], ['ESTADO', 'ACTIVO'],
  ];
  ticketPreviewDetails.innerHTML = `<img class="ticket-preview-logo" src="../assets/img/LOGOMPT.png" alt="Logo AMC My Parking Turn">${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}`;
  ticketPreviewModal.hidden = false;
  closeTicketPreview.focus();
}

// ============================================================
// MODAL: ELIMINAR REGISTRO
//
// La verificacion de contrasena del desarrollador se mantiene
// en fase demo. En produccion se reemplaza por:
//   - Verificacion del rol "admin" en la sesion activa
//   - Endpoint protegido en la API: DELETE /api/records/:id
// ============================================================

function openDeleteModal(type, index) {
  pendingDelete = { type, index };
  deleteForm.reset();
  deleteMessage.textContent = "";
  deleteModal.hidden = false;
  developerPasswordInput.focus();
}

function closeDeleteModal() {
  pendingDelete = null;
  deleteModal.hidden = true;
  deleteForm.reset();
  deleteMessage.textContent = "";
}

async function deleteActiveRecord(index) {
  const records = MPTStorage.getRecords();
  const record  = records[index];

  if (!record) {
    return;
  }

  if (MPTStorage.hasJwtSession()) {
    await MPTStorage.deleteTurn(record.id);
  } else {
    records.splice(index, 1);
    MPTStorage.saveRecords(records);
  }
  renderRecords();
  plateMessage.textContent = `Registro activo eliminado para la placa ${record.plate}.`;
}

async function confirmDeleteWithRoleCheck(password) {
  // ============================================================
  // VALIDACION DE ELIMINACION
  //
  // Fase demo: verifica que el rol de sesion sea "admin".
  // Si el usuario tiene rol admin, se acepta la contrasena
  // que fue configurada al momento de iniciar sesion.
  //
  // TODO (fase backend): reemplazar por:
  //   fetch(`/api/records/${pendingDelete.id}`, {
  //     method: "DELETE",
  //     headers: { Authorization: `Bearer ${sessionToken}` },
  //   })
  //   El backend verificara el rol en el JWT. La contrasena
  //   no se envia; el JWT es suficiente como prueba de identidad.
  // ============================================================

  const userRole = MPTStorage.getActiveUserRole();

  if (userRole !== "admin") {
    deleteMessage.textContent = "Solo un administrador puede eliminar registros.";
    developerPasswordInput.focus();
    return;
  }

  // En fase demo se valida el formato de la contrasena (no el valor exacto)
  // para evitar exponer la contrasena real en el codigo fuente.
  const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
  if (!passwordPattern.test(password)) {
    deleteMessage.textContent = "Contrasena incorrecta o formato invalido.";
    developerPasswordInput.focus();
    return;
  }

  if (!pendingDelete) {
    closeDeleteModal();
    return;
  }

  if (pendingDelete.type === "active") {
    try {
      await deleteActiveRecord(pendingDelete.index);
    } catch (error) {
      deleteMessage.textContent = error.message || 'No fue posible eliminar el turno en el servidor.';
      return;
    }
  }

  closeDeleteModal();
}

// ============================================================
// MODAL: SALIDA DE VEHICULO
// ============================================================

function openExitModal(recordIndex) {
  const records = MPTStorage.getRecords();
  const record  = records[recordIndex];

  if (!record) {
    return;
  }

  const charge = getExitCharge(record, new Date());

  pendingExitIndex = recordIndex;
  exitModalText.textContent = `Placa ${record.plate} | Total a cobrar: ${formatCurrency(charge.totalCharged)} | Horas activo: ${charge.chargedHours}`;
  const customInput = document.querySelector("#customChargeInput");
  if (customInput) customInput.value = "";
  exitModal.hidden = false;
  confirmExit.focus();
}

function closeExitModal() {
  pendingExitIndex = null;
  exitModal.hidden = true;
  exitModalText.textContent = "";
}

// ============================================================
// MODAL: RESUMEN DE COBRO (PDF)
// ============================================================

function openChargeModal(chargeReceipt) {
  pendingPdfTicket = chargeReceipt;
  chargePlate.textContent     = chargeReceipt.plate;
  chargeDate.textContent      = chargeReceipt.date;
  chargeEntryTime.textContent = chargeReceipt.entryTime || chargeReceipt.time;
  chargeExitTime.textContent  = chargeReceipt.exitTime;
  chargeTotal.textContent     = formatCurrency(chargeReceipt.totalCharged);
  chargeModal.hidden = false;
  closeCharge.focus();
}

function closeChargeModal() {
  pendingPdfTicket = null;
  chargeModal.hidden = true;
  chargePlate.textContent     = "";
  chargeDate.textContent      = "";
  chargeEntryTime.textContent = "";
  chargeExitTime.textContent  = "";
  chargeTotal.textContent     = "";
}

// ============================================================
// REGISTRAR SALIDA
// ============================================================

async function registerExit(recordIndex, customCharge = null) {
  const records = MPTStorage.getRecords();
  const record  = records[recordIndex];

  if (!record) {
    return;
  }

  const now      = new Date();
  const exitTime = formatTime(now);
  const { chargedHours, hourlyPrice, totalCharged: calculatedTotal } = getExitCharge(record, now);
  const history  = MPTStorage.getHistory();
  
  const finalTotalCharged = (customCharge !== null && customCharge >= 0) ? customCharge : calculatedTotal;
  const originalTotalCharged = calculatedTotal;

  const chargeReceipt = {
    id:         record.id,
    ticketNumber: record.ticketNumber,
    plate:      record.plate,
    date:       record.date,
    entryTime:  record.time,
    exitTime,
    totalCharged: finalTotalCharged,
    originalTotalCharged,
    hourlyPrice,
    chargedHours,
    vehicleType: record.vehicleType,
    user: record.user,
    operatorName: record.operatorName || record.user,
    entryIso: record.entryIso,
    exitIso: now.toISOString(),
  };

  const historyRecord = {
    id: record.id,
    plate:        record.plate,
    ticketNumber: record.ticketNumber,
    entryIso:     record.entryIso,
    exitIso:      now.toISOString(),
    entryTime:    record.time,
    exitTime,
    date:         record.date,
    hourlyPrice,
    chargedHours,
    totalCharged: finalTotalCharged,
    originalTotalCharged
  };

  let finalizedRecord = chargeReceipt;
  if (MPTStorage.hasJwtSession()) {
    finalizedRecord = await MPTStorage.closeTurn(record.id, {
      chargedHours,
      totalCharged: finalTotalCharged,
      originalTotalCharged,
    });
  } else {
    history.unshift(historyRecord);
    records.splice(recordIndex, 1);
    MPTStorage.saveRecords(records);
    MPTStorage.saveHistory(history);
  }
  renderRecords();
  plateMessage.textContent = `Salida generada para ${record.plate}. Total cobrado: ${formatCurrency(finalTotalCharged)}.`;
  return { ...chargeReceipt, ...finalizedRecord };
}

// ============================================================
// RELOJ EN TIEMPO REAL
// ============================================================

function refreshDateTime() {
  entryDateTime.textContent = formatDateTime(new Date());
  updateLiveCharges();
}

// ============================================================
// INICIALIZACION
// ============================================================

refreshDateTime();
renderConfiguredPrices();
syncConfiguredPricesFromServer();
migrateTicketNumbers();
renderRecords();
setInterval(refreshDateTime, 1000);

// ============================================================
// EVENTOS
// ============================================================

placaInput.addEventListener("input", () => {
  placaInput.value = normalizePlate(placaInput.value);
  plateMessage.textContent = "";
});

activePlateFilterInput.addEventListener("input", () => {
  activePlateFilterInput.value = normalizePlate(activePlateFilterInput.value);
  renderRecords();
});

recordsBody.addEventListener("click", (event) => {
  const exitButton   = event.target.closest(".exit-action");
  const deleteButton = event.target.closest(".delete-action");
  const previewButton = event.target.closest(".ticket-preview-action");

  if (previewButton) {
    const record = MPTStorage.getRecords()[Number(previewButton.dataset.index)];
    if (record) openActiveTicketPreview(record);
    return;
  }

  if (deleteButton) {
    openDeleteModal(deleteButton.dataset.type, Number(deleteButton.dataset.index));
    return;
  }

  if (exitButton) {
    openExitModal(Number(exitButton.dataset.index));
  }
});

chooseOperatorButton.addEventListener('click', openOperatorModal);
document.querySelector('#cancelOperatorSelection').addEventListener('click', () => {
  operatorCodeForm.hidden = true;
  operatorOptions.hidden = false;
});
operatorModal.addEventListener('click', (event) => { if (event.target === operatorModal) operatorModal.hidden = true; });
operatorCodeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingOperator) return;
  operatorModalMessage.textContent = '';
  try {
    const data = await MPTStorage.apiRequest('/auth/operadores/activar', {
      method: 'POST',
      body: JSON.stringify({ tipo: pendingOperator.tipo, operadorId: pendingOperator.id, codigo: operatorCodeInput.value }),
    });
    MPTStorage.saveActiveOperator(data);
    operatorModal.hidden = true;
    renderOperatorStatus();
    renderRecords();
    plateMessage.textContent = `${data.operador.nombre} es el operador activo.`;
  } catch (error) { operatorModalMessage.textContent = error.message; }
});
closeOperatorButton.addEventListener('click', async () => {
  try { await MPTStorage.closeActiveOperator(); }
  catch (error) { plateMessage.textContent = error.message; return; }
  renderOperatorStatus();
  renderRecords();
  plateMessage.textContent = 'Turno de operador cerrado. El sistema quedó en modo consulta.';
});

cancelExit.addEventListener("click", closeExitModal);

confirmExit.addEventListener("click", async () => {
  if (pendingExitIndex === null) {
    closeExitModal();
    return;
  }

  const customInput = document.querySelector("#customChargeInput");
  let customCharge = null;
  if (customInput && customInput.value !== "") {
    const val = Number(customInput.value);
    if (val >= 0) {
      customCharge = val;
    }
  }

  try {
    const chargeReceipt = await registerExit(pendingExitIndex, customCharge);
    closeExitModal();
    if (chargeReceipt) openChargeModal(chargeReceipt);
  } catch (error) {
    plateMessage.textContent = error.message || 'No fue posible registrar la salida en el servidor.';
  }
});

exitModal.addEventListener("click", (event) => {
  if (event.target === exitModal) {
    closeExitModal();
  }
});

closeCharge.addEventListener("click", closeChargeModal);
closeTicketPreview.addEventListener('click', () => { ticketPreviewModal.hidden = true; });
ticketPreviewModal.addEventListener('click', (event) => { if (event.target === ticketPreviewModal) ticketPreviewModal.hidden = true; });

generatePdfButton.addEventListener("click", async () => {
  if (!pendingPdfTicket || !window.MPTTicketPdf) {
    plateMessage.textContent = 'No hay un comprobante de salida disponible para descargar.';
    return;
  }
  try {
    const filename = await window.MPTTicketPdf.download(pendingPdfTicket);
    plateMessage.textContent = `PDF descargado localmente: ${filename}`;
  } catch (_error) {
    plateMessage.textContent = 'No fue posible generar el comprobante PDF con el logo.';
  }
});

chargeModal.addEventListener("click", (event) => {
  if (event.target === chargeModal) {
    closeChargeModal();
  }
});

cancelDelete.addEventListener("click", closeDeleteModal);

deleteModal.addEventListener("click", (event) => {
  if (event.target === deleteModal) {
    closeDeleteModal();
  }
});

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await confirmDeleteWithRoleCheck(developerPasswordInput.value);
});

logoutButton.addEventListener("click", () => {
  // La revocación remota es complementaria: aun si el backend no está
  // disponible, la sesión local se limpia inmediatamente.
  const jwt = MPTStorage.getSessionToken && MPTStorage.getSessionToken();
  if (jwt && jwt.split('.').length === 3) {
    fetch(`${window.MPT_API_BASE || '/api'}/auth/logout`, {
      method: 'POST', headers: { Authorization: `Bearer ${jwt}` },
    }).catch(() => {});
  }
  MPTStorage.clearSession();
  window.location.href = "../index.html";
});

// La creación de cuentas es exclusiva del desarrollador. El enlace nace
// oculto para que nunca se muestre a una cuenta cliente antes de esta validación.
if (manageUsersLink) {
  if (MPTStorage.getActiveUserRole() === 'superadmin') {
    manageUsersLink.hidden = false;
  } else {
    manageUsersLink.remove();
  }
}

renderWelcomeMessage();
renderOperatorStatus();

plateForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!placaInput.value.trim()) {
    plateMessage.textContent = "Ingresa la placa para generar el turno.";
    placaInput.focus();
    return;
  }

  const plate   = normalizePlate(placaInput.value);
  const records = MPTStorage.getRecords();
  const activeRecord = records.find((record) => normalizePlate(record.plate) === plate);

  if (activeRecord) {
    plateMessage.textContent = `La placa ${plate} ya tiene un turno activo (${formatTicket(activeRecord.ticketNumber)}). Debes generar salida antes de registrarla de nuevo.`;
    placaInput.focus();
    return;
  }

  const selectedVehicle = getSelectedVehicle();

  if (!selectedVehicle) {
    plateMessage.textContent = "Selecciona precio moto o precio carro.";
    return;
  }

  const now = new Date();
  const plateRecord = {
    plate,
    ticketNumber: getNextTicketNumber(),
    entryIso:     now.toISOString(),
    date:         formatDate(now),
    time:         formatTime(now),
    vehicleType:  selectedVehicle.type,
    hourlyPrice:  selectedVehicle.price,
    user:         getSelectedOperator()?.nombre || MPTStorage.getActiveUserName(),
  };

  try {
    if (MPTStorage.hasJwtSession()) {
      const persisted = await MPTStorage.createTurn(plateRecord);
      plateRecord.ticketNumber = persisted.ticketNumber;
    } else {
      records.unshift(plateRecord);
      MPTStorage.saveRecords(records);
    }
  } catch (error) {
    plateMessage.textContent = error.message || 'No fue posible guardar el turno en el servidor.';
    return;
  }
  renderRecords();

  plateMessage.textContent = `${formatTicket(plateRecord.ticketNumber)} generado para ${plate} con tarifa ${formatCurrency(selectedVehicle.price)}.`;
  placaInput.value = "";
  vehicleTypeInputs.forEach((input) => {
    input.checked = false;
  });
  placaInput.focus();
});

window.addEventListener('mpt:storage-hydrated', () => {
  migrateTicketNumbers();
  renderRecords();
  renderWelcomeMessage();
  renderOperatorStatus();
});
