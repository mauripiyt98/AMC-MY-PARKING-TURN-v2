// ============================================================
// mensualidades.js — Modulo de mensualidades My Parking Turn
// My Parking Turn v2
//
// Dependencias (cargadas antes en el HTML):
//   1. session-guard.js  — proteccion de ruta
//   2. storage.js        — capa de datos SaaS
// ============================================================

// ===== Referencias DOM =====
const monthlyForm          = document.getElementById("monthlyForm");
const mPlacaInput          = document.getElementById("mPlaca");
const mStartDateInput      = document.getElementById("mStartDate");
const mRateInput           = document.getElementById("mRate");
const mFormMessage         = document.getElementById("mFormMessage");
const mActivePlateFilter   = document.getElementById("mActivePlateFilter");
const activeBody           = document.getElementById("activeBody");
const calendarGrid         = document.getElementById("calendarGrid");
const calendarMonthLabel   = document.getElementById("calendarMonthLabel");
const prevMonthBtn         = document.getElementById("prevMonthBtn");
const nextMonthBtn         = document.getElementById("nextMonthBtn");
const historyTableWrap     = document.getElementById("historyTableWrap");
const historyBody          = document.getElementById("historyBody");
const mStartFilter         = document.getElementById("mStartFilter");
const mEndFilter           = document.getElementById("mEndFilter");
const mFilterBtn           = document.getElementById("mFilterBtn");
const mClearFilterBtn      = document.getElementById("mClearFilterBtn");
const mSummaryPeriod       = document.getElementById("mSummaryPeriod");
const mSummaryTickets      = document.getElementById("mSummaryTickets");
const mSummaryTotal        = document.getElementById("mSummaryTotal");
const mHistoryMessage      = document.getElementById("mHistoryMessage");
const exitModal            = document.getElementById("exitModal");
const exitModalText        = document.getElementById("exitModalText");
const cancelExitBtn        = document.getElementById("cancelExitBtn");
const confirmExitBtn       = document.getElementById("confirmExitBtn");
const deleteModal          = document.getElementById("deleteModal");
const deleteForm           = document.getElementById("deleteForm");
const developerPasswordInput = document.getElementById("developerPassword");
const deleteMessage        = document.getElementById("deleteMessage");
const cancelDeleteBtn      = document.getElementById("cancelDeleteBtn");
const logoutButton         = document.getElementById("logoutButton");

// ===== Estado =====
let calendarYear    = new Date().getFullYear();
let calendarMonth   = new Date().getMonth();
let pendingExitIndex = null;
let pendingDelete    = null;

// ================================================================
// STORAGE — via capa MPTStorage (storage.js)
// ================================================================

function getMonthlyRecords()       { return MPTStorage.getMonthlyRecords(); }
function saveMonthlyRecords(r)     { MPTStorage.saveMonthlyRecords(r); }
function getMonthlyHistory()       { return MPTStorage.getMonthlyHistory(); }
function saveMonthlyHistory(h)     { MPTStorage.saveMonthlyHistory(h); }

function getNextTicketNumber() {
  const records = getMonthlyRecords();
  const history = getMonthlyHistory();
  const stored  = MPTStorage.getStoredNextMonthlyTicket();
  const highest = [...records, ...history].reduce(
    (max, r) => Math.max(max, Number(r.ticketNumber || 0)), 0
  );
  const next = Math.max(
    Number.isInteger(stored) && stored > 0 ? stored : 1,
    highest + 1
  );
  MPTStorage.saveNextMonthlyTicket(next + 1);
  return next;
}

// ================================================================
// UTILIDADES Y FORMATO
// ================================================================

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return "SIN DATO";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(
    new Date(y, m - 1, d)
  );
}

function normalizePlate(value) {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function getTodayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/**
 * Suma exactamente un mes calendario a una fecha YYYY-MM-DD.
 * Si el dia no existe en el mes destino, usa el ultimo dia del mes.
 */
function addOneMonth(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextMonth  = m === 12 ? 1  : m + 1;
  const nextYear   = m === 12 ? y + 1 : y;
  const lastDay    = new Date(nextYear, nextMonth, 0).getDate();
  const targetDay  = Math.min(d, lastDay);
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

/**
 * Retorna los dias restantes hasta el vencimiento.
 * 0 = vence hoy, negativo = ya vencio.
 */
function getDaysRemaining(expiryDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [y, m, d] = expiryDateStr.split("-").map(Number);
  const expiry = new Date(y, m - 1, d);
  expiry.setHours(0, 0, 0, 0);
  return Math.round((expiry - today) / 86400000);
}

function getStatusInfo(days) {
  if (days < 0)   return { text: "VENCIDA",          cls: "status-expired" };
  if (days === 0) return { text: "VENCE HOY",        cls: "status-warning" };
  if (days <= 7)  return { text: `${days}d restantes`, cls: "status-warning" };
  return           { text: `${days} dias`,            cls: "status-active"  };
}

function getPeriodLabel() {
  const start = mStartFilter ? mStartFilter.value : "";
  const end   = mEndFilter   ? mEndFilter.value   : "";
  if (start && end)   return `${formatDateDisplay(start)} - ${formatDateDisplay(end)}`;
  if (start)          return `DESDE ${formatDateDisplay(start)}`;
  if (end)            return `HASTA ${formatDateDisplay(end)}`;
  return "TODOS LOS HISTORICOS";
}

// ================================================================
// AUTO-VENCIMIENTO
// ================================================================

/**
 * Mueve al historico los registros cuya fecha de vencimiento
 * ya paso. Se ejecuta al cargar la pagina.
 */
async function checkExpiredSubscriptions() {
  const records  = getMonthlyRecords();
  const history  = getMonthlyHistory();
  const todayStr = getTodayStr();

  const stillActive  = [];
  const nowExpired   = [];

  records.forEach((record) => {
    if (record.expiryDate < todayStr) {
      nowExpired.push({
        ...record,
        closedDate:   record.expiryDate,
        closedReason: "VENCIMIENTO AUTOMATICO",
      });
    } else {
      stillActive.push(record);
    }
  });

  if (nowExpired.length > 0) {
    if (MPTStorage.hasJwtSession()) {
      for (const record of nowExpired) {
        await MPTStorage.closeMonthly(record.id, 'VENCIMIENTO AUTOMATICO');
      }
    } else {
      saveMonthlyRecords(stillActive);
      saveMonthlyHistory([...nowExpired, ...history]);
    }
  }
}

// ================================================================
// CALENDARIO
// ================================================================

function renderCalendar() {
  const records  = getMonthlyRecords();
  const todayStr = getTodayStr();

  const monthDate = new Date(calendarYear, calendarMonth, 1);
  calendarMonthLabel.textContent = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
  }).format(monthDate).toUpperCase();

  const firstWeekDay  = monthDate.getDay();
  const daysInMonth   = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const dayNames      = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];

  let html = dayNames.map((n) => `<div class="cal-header-cell">${n}</div>`).join("");

  // Celdas vacías al inicio
  for (let i = 0; i < firstWeekDay; i++) {
    html += `<div class="cal-day cal-empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = dateStr === todayStr;

    const activeOnDay   = records.filter((r) => r.startDate <= dateStr && r.expiryDate >= dateStr);
    const expiringToday = records.filter((r) => r.expiryDate === dateStr);
    const warningOnDay  = records.filter((r) => {
      const d = getDaysRemaining(r.expiryDate);
      return r.startDate <= dateStr && r.expiryDate >= dateStr && d > 0 && d <= 7;
    });

    let cls = "cal-day";
    if (isToday)              cls += " cal-today";
    if (expiringToday.length) cls += " cal-expiry";
    else if (warningOnDay.length) cls += " cal-warning-day";
    else if (activeOnDay.length)  cls += " cal-active";

    const visibleDots  = activeOnDay.slice(0, 4);
    const extraCount   = activeOnDay.length - visibleDots.length;
    const plateTooltip = activeOnDay.map((r) => r.plate).join(", ");

    const dotsHtml = activeOnDay.length > 0
      ? `<div class="cal-dots">
          ${visibleDots.map((r) => `<span class="cal-dot" title="${r.plate}"></span>`).join("")}
          ${extraCount > 0 ? `<span class="cal-dot-more">+${extraCount}</span>` : ""}
         </div>`
      : "";

    html += `<div class="${cls}" title="${plateTooltip}">
      <span class="cal-num">${day}</span>
      ${dotsHtml}
    </div>`;
  }

  calendarGrid.innerHTML = html;
}

// ================================================================
// RENDER MENSUALIDADES ACTIVAS
// ================================================================

function renderActiveSubscriptions() {
  const records    = getMonthlyRecords();
  const filterVal  = mActivePlateFilter ? mActivePlateFilter.value.trim().toUpperCase() : "";
  const mapped     = records.map((record, index) => ({ record, index }));
  const filtered   = filterVal
    ? mapped.filter(({ record }) => normalizePlate(record.plate).includes(filterVal))
    : mapped;

  if (records.length === 0) {
    activeBody.innerHTML = `<tr class="empty-record"><td colspan="10">AUN NO HAY MENSUALIDADES REGISTRADAS</td></tr>`;
    return;
  }

  if (filtered.length === 0) {
    activeBody.innerHTML = `<tr class="empty-record"><td colspan="10">NO HAY MENSUALIDADES PARA ESA PLACA</td></tr>`;
    return;
  }

  activeBody.innerHTML = filtered.map(({ record, index }) => {
    const days               = getDaysRemaining(record.expiryDate);
    const { text, cls }      = getStatusInfo(days);
    return `<tr>
      <td>MEN-${record.ticketNumber}</td>
      <td>${record.plate}</td>
      <td>${record.vehicleType || "-"}</td>
      <td>${formatDateDisplay(record.startDate)}</td>
      <td>${formatDateDisplay(record.expiryDate)}</td>
      <td>${formatCurrency(record.monthlyRate)}</td>
      <td><span class="status-badge ${cls}">${text}</span></td>
      <td>${record.user}</td>
      <td><button class="exit-action monthly-close-btn" data-index="${index}" type="button">CERRAR</button></td>
      <td><button class="delete-action monthly-delete-btn" data-index="${index}" data-type="active" type="button">ELIMINAR</button></td>
    </tr>`;
  }).join("");
}

// ================================================================
// RENDER HISTORICO
// ================================================================

function renderHistory() {
  const history    = getMonthlyHistory();
  const startF     = mStartFilter ? mStartFilter.value : "";
  const endF       = mEndFilter   ? mEndFilter.value   : "";

  // Asociar index original ANTES de filtrar
  const withIndex  = history.map((record, originalIndex) => ({ record, originalIndex }));

  const filtered   = withIndex.filter(({ record }) => {
    const compareDate = record.closedDate || record.expiryDate || record.startDate || "";
    if (startF && compareDate < startF) return false;
    if (endF   && compareDate > endF)   return false;
    return true;
  });

  // Validar rango
  if (startF && endF && startF > endF) {
    mHistoryMessage.textContent = "La fecha inicial no puede ser mayor que la fecha final.";
    return;
  }
  mHistoryMessage.textContent = "";

  const total = filtered.reduce((sum, { record }) => sum + Number(record.monthlyRate || 0), 0);

  if (mSummaryPeriod)  mSummaryPeriod.textContent  = getPeriodLabel();
  if (mSummaryTickets) mSummaryTickets.textContent  = String(filtered.length);
  if (mSummaryTotal)   mSummaryTotal.textContent    = formatCurrency(total);

  if (filtered.length === 0) {
    historyBody.innerHTML = `<tr class="empty-record"><td colspan="8">NO HAY HISTORICOS EN EL PERIODO SELECCIONADO</td></tr>`;
    return;
  }

  historyBody.innerHTML = filtered.map(({ record, originalIndex }) => `<tr>
    <td>MEN-${record.ticketNumber}</td>
    <td>${record.plate}</td>
    <td>${record.vehicleType || "-"}</td>
    <td>${formatDateDisplay(record.startDate)}</td>
    <td>${formatDateDisplay(record.closedDate || record.expiryDate)}</td>
    <td>${formatCurrency(record.monthlyRate)}</td>
    <td>${record.closedReason || "CIERRE MANUAL"}</td>
    <td><button class="delete-action hist-delete-btn" data-index="${originalIndex}" type="button">ELIMINAR</button></td>
  </tr>`).join("");
}

// ================================================================
// MODAL: CERRAR MENSUALIDAD
// ================================================================

function openExitModal(index) {
  const records = getMonthlyRecords();
  const record  = records[index];
  if (!record) return;
  pendingExitIndex = index;
  exitModalText.textContent = `Placa ${record.plate} | MEN-${record.ticketNumber} | Tarifa: ${formatCurrency(record.monthlyRate)}`;
  exitModal.hidden = false;
  confirmExitBtn.focus();
}

function closeExitModal() {
  exitModal.hidden    = true;
  pendingExitIndex    = null;
  exitModalText.textContent = "";
}

cancelExitBtn.addEventListener("click", closeExitModal);

exitModal.addEventListener("click", (e) => {
  if (e.target === exitModal) closeExitModal();
});

confirmExitBtn.addEventListener("click", async () => {
  if (pendingExitIndex === null) { closeExitModal(); return; }

  const records = getMonthlyRecords();
  const record  = records[pendingExitIndex];

  if (record) {
    try {
      if (MPTStorage.hasJwtSession()) {
        await MPTStorage.closeMonthly(record.id, 'CIERRE MANUAL');
      } else {
        const history = getMonthlyHistory();
        history.unshift({ ...record, closedDate: getTodayStr(), closedReason: "CIERRE MANUAL" });
        saveMonthlyHistory(history);
        records.splice(pendingExitIndex, 1);
        saveMonthlyRecords(records);
      }
    } catch (error) {
      mFormMessage.textContent = error.message || 'No fue posible cerrar la mensualidad en el servidor.';
      closeExitModal();
      return;
    }
    mFormMessage.textContent = `Mensualidad MEN-${record.ticketNumber} cerrada para ${record.plate}.`;
    renderActiveSubscriptions();
    renderCalendar();
    renderHistory();
  }

  closeExitModal();
});

// ================================================================
// MODAL: ELIMINAR CON VERIFICACION DE ROL
//
// Fase demo: verifica rol "admin" en sesion + formato de contrasena.
// TODO (fase backend): reemplazar por DELETE /api/monthly/:id
//   con Authorization: Bearer <token>. El backend valida el rol.
// ================================================================

function openDeleteModal() {
  deleteForm.reset();
  deleteMessage.textContent = "";
  deleteModal.hidden = false;
  developerPasswordInput.focus();
}

function closeDeleteModal() {
  deleteModal.hidden = true;
  pendingDelete      = null;
  deleteForm.reset();
  deleteMessage.textContent = "";
}

cancelDeleteBtn.addEventListener("click", closeDeleteModal);

deleteModal.addEventListener("click", (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

deleteForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userRole = MPTStorage.getActiveUserRole();

  if (userRole !== "admin") {
    deleteMessage.textContent = "Solo un administrador puede eliminar registros.";
    developerPasswordInput.focus();
    return;
  }

  // Verificar formato de contrasena (sin exponer el valor exacto en codigo)
  const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
  if (!passwordPattern.test(developerPasswordInput.value)) {
    deleteMessage.textContent = "Contrasena incorrecta o formato invalido.";
    developerPasswordInput.focus();
    return;
  }

  if (!pendingDelete) { closeDeleteModal(); return; }

  if (pendingDelete.type === "active") {
    const records = getMonthlyRecords();
    const record  = records[pendingDelete.index];
    try {
      if (MPTStorage.hasJwtSession()) await MPTStorage.deleteMonthly(record.id);
      else {
        records.splice(pendingDelete.index, 1);
        saveMonthlyRecords(records);
      }
    } catch (error) {
      deleteMessage.textContent = error.message || 'No fue posible eliminar la mensualidad.';
      return;
    }
    mFormMessage.textContent = record
      ? `Registro activo eliminado para la placa ${record.plate}.`
      : "";
    renderActiveSubscriptions();
    renderCalendar();
  } else if (pendingDelete.type === "history") {
    const history = getMonthlyHistory();
    const record  = history[pendingDelete.index];
    try {
      if (MPTStorage.hasJwtSession()) await MPTStorage.deleteMonthly(record.id);
      else {
        history.splice(pendingDelete.index, 1);
        saveMonthlyHistory(history);
      }
    } catch (error) {
      deleteMessage.textContent = error.message || 'No fue posible eliminar la mensualidad.';
      return;
    }
    mHistoryMessage.textContent = record
      ? `Registro historico eliminado para la placa ${record.plate}.`
      : "";
    renderHistory();
  }

  closeDeleteModal();
});

// ================================================================
// DELEGACION DE EVENTOS: TABLA ACTIVOS
// ================================================================

activeBody.addEventListener("click", (e) => {
  const closeBtn  = e.target.closest(".monthly-close-btn");
  const deleteBtn = e.target.closest(".monthly-delete-btn");

  if (closeBtn) {
    openExitModal(Number(closeBtn.dataset.index));
    return;
  }

  if (deleteBtn) {
    pendingDelete = { type: "active", index: Number(deleteBtn.dataset.index) };
    openDeleteModal();
  }
});

// ================================================================
// DELEGACION DE EVENTOS: TABLA HISTORICO
// ================================================================

historyTableWrap.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".hist-delete-btn");
  if (!deleteBtn) return;
  pendingDelete = { type: "history", index: Number(deleteBtn.dataset.index) };
  openDeleteModal();
});

// ================================================================
// NAVEGACION DEL CALENDARIO
// ================================================================

prevMonthBtn.addEventListener("click", () => {
  calendarMonth--;
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  renderCalendar();
});

nextMonthBtn.addEventListener("click", () => {
  calendarMonth++;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  renderCalendar();
});

// ================================================================
// FORMULARIO DE REGISTRO
// ================================================================

monthlyForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const plate = normalizePlate(mPlacaInput.value);
  if (!plate) {
    mFormMessage.textContent = "Ingresa la placa del vehiculo.";
    mPlacaInput.focus();
    return;
  }

  const startDate = mStartDateInput.value;
  if (!startDate) {
    mFormMessage.textContent = "Selecciona la fecha de inicio de la mensualidad.";
    mStartDateInput.focus();
    return;
  }

  const rateRaw = Number(mRateInput.value.replace(/\D/g, ""));
  if (!rateRaw || rateRaw < 1000) {
    mFormMessage.textContent = "Ingresa un valor mensual valido (minimo $1.000).";
    mRateInput.focus();
    return;
  }

  const selectedVehicle = [...document.querySelectorAll('input[name="mVehicleType"]')].find(
    (i) => i.checked
  );
  if (!selectedVehicle) {
    mFormMessage.textContent = "Selecciona el tipo de vehiculo.";
    return;
  }

  const records  = getMonthlyRecords();
  const existing = records.find((r) => normalizePlate(r.plate) === plate);
  if (existing) {
    mFormMessage.textContent = `La placa ${plate} ya tiene una mensualidad activa (MEN-${existing.ticketNumber}).`;
    mPlacaInput.focus();
    return;
  }

  const expiryDate = addOneMonth(startDate);
  const newRecord  = {
    ticketNumber: getNextTicketNumber(),
    plate,
    vehicleType:  selectedVehicle.dataset.label,
    startDate,
    expiryDate,
    monthlyRate:  rateRaw,
    user:         MPTStorage.getActiveUserName(),
    createdAt:    new Date().toISOString(),
  };

  try {
    if (MPTStorage.hasJwtSession()) {
      const persisted = await MPTStorage.createMonthly(newRecord);
      newRecord.ticketNumber = persisted.ticketNumber;
    } else {
      records.unshift(newRecord);
      saveMonthlyRecords(records);
    }
  } catch (error) {
    mFormMessage.textContent = error.message || 'No fue posible registrar la mensualidad en el servidor.';
    return;
  }
  mFormMessage.textContent = `Mensualidad MEN-${newRecord.ticketNumber} registrada para ${plate}. Vence: ${formatDateDisplay(expiryDate)}.`;
  monthlyForm.reset();
  mStartDateInput.value = getTodayStr();
  renderActiveSubscriptions();
  renderCalendar();
});

// Normalizacion en tiempo real de la placa
mPlacaInput.addEventListener("input", () => {
  mPlacaInput.value = normalizePlate(mPlacaInput.value);
  mFormMessage.textContent = "";
});

// Solo numeros en el campo de tarifa
mRateInput.addEventListener("input", () => {
  const cleaned = mRateInput.value.replace(/\D/g, "");
  mRateInput.value = cleaned;
  mFormMessage.textContent = "";
});

// Filtro de placa en tabla activos
if (mActivePlateFilter) {
  mActivePlateFilter.addEventListener("input", () => {
    mActivePlateFilter.value = normalizePlate(mActivePlateFilter.value);
    renderActiveSubscriptions();
  });
}

// Filtros del historico
mFilterBtn.addEventListener("click", () => {
  renderHistory();
});

mClearFilterBtn.addEventListener("click", () => {
  if (mStartFilter) mStartFilter.value = "";
  if (mEndFilter)   mEndFilter.value   = "";
  renderHistory();
});

// Cerrar sesion
logoutButton.addEventListener("click", () => {
  MPTStorage.clearSession();
  window.location.href = "../../index.html";
});

// ================================================================
// INICIALIZACION
// ================================================================

async function init() {
  await MPTStorage.hydrateFromServer();
  // Fecha de hoy como valor por defecto del campo de inicio
  mStartDateInput.value = getTodayStr();
  // Mover a historico los vencidos automaticamente
  await checkExpiredSubscriptions();
  // Renderizar
  renderCalendar();
  renderActiveSubscriptions();
  renderHistory();
}

init();

// Refrescar estado en tiempo real cada 60 segundos
setInterval(async () => {
  await checkExpiredSubscriptions();
  renderActiveSubscriptions();
  renderCalendar();
}, 60000);

window.addEventListener('mpt:storage-hydrated', () => {
  renderCalendar();
  renderActiveSubscriptions();
  renderHistory();
});
