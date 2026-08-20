// ============================================================
// mensualidades.js — Modulo de mensualidades My Parking Turn
// My Parking Turn v2 — Actualizado: RENOVAR + GESTIONAR COBROS
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
const mResponsibleInput    = document.getElementById("mResponsible");
const mDocumentInput       = document.getElementById("mDocument");
const mContactInput        = document.getElementById("mContact");
const mAddressInput        = document.getElementById("mAddress");
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
const monthlyDriversList   = document.getElementById("monthlyDriversList");
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

// ── Cobros modal ──
const monthlyChargeModal    = document.getElementById("monthlyChargeModal");
const chargeModalDriverInfo = document.getElementById("chargeModalDriverInfo");
const chargeList            = document.getElementById("chargeList");
const monthlyChargeMessage  = document.getElementById("monthlyChargeMessage");
const closeMonthlyCharge    = document.getElementById("closeMonthlyCharge");

// ===== Estado =====
let calendarYear      = new Date().getFullYear();
let calendarMonth     = new Date().getMonth();
let pendingExitIndex  = null;
let pendingDelete     = null;
let pendingChargeRecord = null;  // Registro activo en modal de cobros

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

function escapeHtml(value) {
  return String(value || "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ================================================================
// AUTO-VENCIMIENTO
// ================================================================

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
// RENDER MENSUALIDADES ACTIVAS  (incluye columna RENOVAR)
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
    const days          = getDaysRemaining(record.expiryDate);
    const { text, cls } = getStatusInfo(days);

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

  const withIndex  = history.map((record, originalIndex) => ({ record, originalIndex }));

  const filtered   = withIndex.filter(({ record }) => {
    const compareDate = record.closedDate || record.expiryDate || record.startDate || "";
    if (startF && compareDate < startF) return false;
    if (endF   && compareDate > endF)   return false;
    return true;
  });

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
// RENDER CONDUCTORES  (incluye GESTIONAR COBROS y RENOVAR)
// ================================================================

function renderMonthlyDrivers() {
  if (!monthlyDriversList) return;

  const today       = getTodayStr();
  const activeRecords = getMonthlyRecords();
  const historyRecords = getMonthlyHistory();
  const activeIds   = new Set(activeRecords.map((r) => r.id || `ticket-${r.ticketNumber}`));

  const allRecords  = [...activeRecords, ...historyRecords]
    .sort((a, b) => {
      // Priorizar los activos primero
      const aActive = activeIds.has(a.id || `ticket-${a.ticketNumber}`) && a.expiryDate >= today ? 1 : 0;
      const bActive = activeIds.has(b.id || `ticket-${b.ticketNumber}`) && b.expiryDate >= today ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return String(b.createdAt || b.startDate || "").localeCompare(String(a.createdAt || a.startDate || ""));
    });

  if (allRecords.length === 0) {
    monthlyDriversList.innerHTML = '<p class="monthly-drivers-empty">AÚN NO HAY CONDUCTORES REGISTRADOS EN MENSUALIDADES.</p>';
    return;
  }

  // Agrupar por conductor único (documento o placa) para mostrar su estado actual
  const seenDrivers = new Map();
  for (const record of allRecords) {
    const key = String(record.document || record.plate || record.id || record.ticketNumber).trim().toUpperCase();
    if (!seenDrivers.has(key)) {
      seenDrivers.set(key, record);
    }
  }

  const driverCards = Array.from(seenDrivers.values());

  monthlyDriversList.innerHTML = driverCards.map((record) => {
    const recordId    = record.id || `ticket-${record.ticketNumber}`;
    const isActive    = activeIds.has(recordId) && record.expiryDate >= today;
    const statusBadge = isActive
      ? '<span class="monthly-driver-status monthly-driver-status--active">ACTIVA</span>'
      : `<span class="monthly-driver-status monthly-driver-status--expired">${record.expiryDate < today ? "VENCIDA" : "FINALIZADA"}</span>`;

    // Botón RENOVAR: deshabilitado si está activa, habilitado si está vencida/finalizada
    const renewBtn = isActive
      ? `<button class="renew-action renew-action--disabled" disabled type="button" title="La mensualidad aún está activa. Solo se puede renovar cuando esté vencida.">🔄 RENOVAR</button>`
      : `<button class="renew-action monthly-driver-renew-btn" data-record-key="${escapeHtml(recordId)}" type="button" title="Renovar mensualidad desde ${record.expiryDate}">🔄 RENOVAR</button>`;

    return `<article class="monthly-driver-card">
      <div class="monthly-driver-card__header">
        <strong>MEN-${escapeHtml(record.ticketNumber)}</strong>
        ${statusBadge}
        <div class="monthly-driver-card__actions">
          <button class="manage-charges-btn" data-record-key="${escapeHtml(recordId)}" type="button">💰 GESTIONAR COBROS</button>
          ${renewBtn}
        </div>
      </div>
      <dl>
        <div><dt>RESPONSABLE</dt><dd>${escapeHtml(record.responsible)}</dd></div>
        <div><dt>DOCUMENTO</dt><dd>${escapeHtml(record.document)}</dd></div>
        <div><dt>CONTACTO</dt><dd>${escapeHtml(record.contact)}</dd></div>
        <div><dt>DIRECCIÓN</dt><dd>${escapeHtml(record.address)}</dd></div>
        <div><dt>PLACA</dt><dd>${escapeHtml(record.plate)}</dd></div>
        <div><dt>TARIFA</dt><dd>${formatCurrency(record.monthlyRate)}</dd></div>
        <div><dt>INICIO</dt><dd>${formatDateDisplay(record.startDate)}</dd></div>
        <div><dt>VENCIMIENTO</dt><dd>${formatDateDisplay(record.expiryDate)}</dd></div>
      </dl>
    </article>`;
  }).join("");
}

// ================================================================
// GESTIONAR COBROS — Modal
// ================================================================

function openChargeModal(record) {
  const allMonthlyRecords = [...getMonthlyRecords(), ...getMonthlyHistory()];
  const driverRecords = allMonthlyRecords.filter((r) => (
    (record.document && r.document && String(r.document).trim() === String(record.document).trim()) ||
    (record.plate && r.plate && String(r.plate).trim().toUpperCase() === String(record.plate).trim().toUpperCase()) ||
    (record.id && r.id && String(r.id) === String(record.id)) ||
    (record.ticketNumber && r.ticketNumber && Number(r.ticketNumber) === Number(record.ticketNumber))
  ));
  driverRecords.sort((a, b) => Number(b.ticketNumber || 0) - Number(a.ticketNumber || 0));
  const latestRecord = driverRecords[0] || record;
  pendingChargeRecord = latestRecord;

  chargeModalDriverInfo.innerHTML = `
    <span class="charge-modal-plate">${escapeHtml(latestRecord.plate)}</span>
    <span class="charge-modal-sep">•</span>
    <span class="charge-modal-name">${escapeHtml(latestRecord.responsible || "CONDUCTOR")}</span>
    <span class="charge-modal-sep">•</span>
    <span class="charge-modal-ticket">ÚLTIMO TICKET: MEN-${escapeHtml(String(latestRecord.ticketNumber))}</span>`;

  monthlyChargeMessage.textContent = "";
  renderChargeList(latestRecord);

  monthlyChargeModal.hidden        = false;
  document.body.style.overflow     = "hidden";
}

function renderChargeList(record) {
  const allMonthlyRecords = [...getMonthlyRecords(), ...getMonthlyHistory()];
  
  // Encontrar todas las mensualidades pertenecientes a este conductor (por placa o documento o ticketNumber)
  const driverMonthlyRecords = allMonthlyRecords.filter((r) => {
    if (record.document && r.document && String(r.document).trim() === String(record.document).trim()) return true;
    if (record.plate && r.plate && String(r.plate).trim().toUpperCase() === String(record.plate).trim().toUpperCase()) return true;
    if (record.id && r.id && String(r.id) === String(record.id)) return true;
    if (record.ticketNumber && r.ticketNumber && Number(r.ticketNumber) === Number(record.ticketNumber)) return true;
    return false;
  });

  // Si por alguna razón el registro actual no está en la lista filtrada, agregarlo
  if (!driverMonthlyRecords.some((r) => String(r.id || r.ticketNumber) === String(record.id || record.ticketNumber))) {
    driverMonthlyRecords.push(record);
  }

  // Ordenar los tickets de más reciente a más antiguo
  driverMonthlyRecords.sort((a, b) => Number(b.ticketNumber || 0) - Number(a.ticketNumber || 0));

  const allCharges = MPTStorage.getMonthlyCharges ? MPTStorage.getMonthlyCharges() : [];
  let chargesUpdated = false;
  const displayItems = [];

  for (const mRec of driverMonthlyRecords) {
    const mRecId = mRec.id || `ticket-${mRec.ticketNumber}`;
    
    // Buscar si ya existe un cobro para este ticket
    let charge = allCharges.find((c) => 
      String(c.monthlyId) === String(mRecId) ||
      (mRec.id && String(c.monthlyId) === String(mRec.id)) ||
      (c.ticketNumber && Number(c.ticketNumber) === Number(mRec.ticketNumber)) ||
      String(c.id) === `charge-${mRecId}` ||
      String(c.id) === `charge-${mRec.id}` ||
      String(c.id) === `charge-${mRec.ticketNumber}`
    );

    // Si no existe, crearlo automáticamente
    if (!charge && Number(mRec.monthlyRate) > 0) {
      charge = {
        id:           `charge-${mRecId}`,
        monthlyId:    mRecId,
        ticketNumber: mRec.ticketNumber,
        amount:       Number(mRec.monthlyRate),
        status:       "POR_COBRAR",
        paidAt:       null,
        createdAt:    mRec.createdAt || new Date().toISOString(),
      };
      allCharges.unshift(charge);
      chargesUpdated = true;
    }

    if (charge) {
      displayItems.push({ charge, record: mRec });
    }
  }

  if (chargesUpdated && MPTStorage.saveMonthlyCharges) {
    MPTStorage.saveMonthlyCharges(allCharges);
  }

  if (displayItems.length === 0) {
    chargeList.innerHTML = `<p class="charge-list-empty">No hay cobros registrados para esta mensualidad.<br>
      <small>Los cobros se crean automáticamente al registrar o renovar.</small></p>`;
    return;
  }

  chargeList.innerHTML = displayItems.map(({ charge, record: mRec }) => {
    const isPending   = charge.status !== "PAGADO";
    const amountFmt   = formatCurrency(charge.amount || mRec.monthlyRate);
    const ticketLabel = mRec.ticketNumber ? `MEN-${mRec.ticketNumber}` : (charge.ticketNumber ? `MEN-${charge.ticketNumber}` : "MEN-?");
    const periodText  = (mRec.startDate && mRec.expiryDate)
      ? `${formatDateDisplay(mRec.startDate)} → ${formatDateDisplay(mRec.expiryDate)}`
      : "";

    return `<div class="charge-item ${isPending ? "charge-item--pending" : "charge-item--paid"}" data-charge-id="${charge.id}">
      <div class="charge-item-left">
        <div class="charge-item-header-row">
          <span class="charge-item-badge">${escapeHtml(ticketLabel)}</span>
          ${periodText ? `<span class="charge-item-period">${escapeHtml(periodText)}</span>` : ""}
        </div>
        <div class="charge-item-status-row">
          ${charge.paidAt
            ? `<span class="charge-status-pill charge-status-pill--paid">✅ Pagado: ${new Date(charge.paidAt).toLocaleDateString("es-CO")}</span>`
            : `<span class="charge-status-pill charge-status-pill--pending">⏳ Por Cobrar</span>`}
        </div>
      </div>
      <div class="charge-item-center">
        <span class="charge-item-label">VALOR MES</span>
        <strong class="charge-item-amount">${amountFmt}</strong>
      </div>
      <div class="charge-item-actions">
        <button class="charge-status-btn charge-btn--pending ${isPending ? "charge-btn--active" : ""}"
                data-charge-id="${charge.id}" data-status="POR_COBRAR" type="button">POR COBRAR</button>
        <button class="charge-status-btn charge-btn--paid ${!isPending ? "charge-btn--active" : ""}"
                data-charge-id="${charge.id}" data-status="PAGADO" type="button">PAGADO</button>
      </div>
    </div>`;
  }).join("");
}

function closeChargeModal() {
  monthlyChargeModal.hidden        = true;
  document.body.style.overflow     = "";
  pendingChargeRecord              = null;
  if (monthlyChargeMessage) monthlyChargeMessage.textContent = "";
}

async function handleChargeStatusUpdate(chargeId, status) {
  monthlyChargeMessage.textContent = "";

  try {
    if (MPTStorage.hasJwtSession()) {
      await MPTStorage.updateMonthlyCharge(chargeId, status);
    } else {
      // Modo local
      const charges = MPTStorage.getMonthlyCharges();
      const idx     = charges.findIndex((c) => String(c.id) === String(chargeId));
      if (idx !== -1) {
        charges[idx].status = status;
        charges[idx].paidAt = status === "PAGADO" ? new Date().toISOString() : null;
        MPTStorage.saveMonthlyCharges(charges);
      }
    }

    if (pendingChargeRecord) {
      renderChargeList(pendingChargeRecord);
    }

    monthlyChargeMessage.textContent = status === "PAGADO"
      ? "✅ Cobro marcado como PAGADO."
      : "🔴 Cobro marcado como POR COBRAR.";
    monthlyChargeMessage.className = "form-message" + (status === "PAGADO" ? " is-success" : "");

  } catch (err) {
    monthlyChargeMessage.textContent = err.message || "No fue posible actualizar el estado del cobro.";
    monthlyChargeMessage.className   = "form-message";
  }
}

// ================================================================
// RENOVAR MENSUALIDAD
// ================================================================

/**
 * Modo local: crea un nuevo registro iniciando desde expiryDate del anterior.
 * El nuevo mes SIEMPRE arranca en la fecha de vencimiento del mes anterior.
 */
function renewMonthlyLocal(record) {
  const records = getMonthlyRecords();

  const newStartDate  = record.expiryDate;           // Fecha exacta de vencimiento anterior
  const newExpiryDate = addOneMonth(newStartDate);    // + 1 mes calendario
  const newTicketNum  = getNextTicketNumber();
  const newId         = `ticket-${newTicketNum}-${Date.now()}`;

  const newRecord = {
    id:            newId,
    ticketNumber:  newTicketNum,
    plate:         record.plate,
    vehicleType:   record.vehicleType,
    startDate:     newStartDate,
    expiryDate:    newExpiryDate,
    monthlyRate:   record.monthlyRate,
    responsible:   record.responsible,
    document:      record.document,
    contact:       record.contact,
    address:       record.address,
    user:          MPTStorage.getActiveUserName(),
    renewedFromId: record.id,
    createdAt:     new Date().toISOString(),
  };

  records.unshift(newRecord);
  saveMonthlyRecords(records);

  // Crear cobro automático por la renovación
  if (MPTStorage.getMonthlyCharges && MPTStorage.saveMonthlyCharges) {
    const charges = MPTStorage.getMonthlyCharges();
    charges.unshift({
      id:            `charge-${Date.now()}`,
      monthlyId:     newId,
      ticketNumber:  newTicketNum,
      amount:        record.monthlyRate,
      status:        "POR_COBRAR",
      paidAt:        null,
      createdAt:     new Date().toISOString(),
    });
    MPTStorage.saveMonthlyCharges(charges);
  }

  return newRecord;
}

async function handleRenew(record) {
  const newStart = record.expiryDate;
  const newExpiry = addOneMonth(newStart);

  const confirmMsg =
    `¿Renovar mensualidad?\n\n` +
    `Placa: ${record.plate}\n` +
    `Tarifa: ${formatCurrency(record.monthlyRate)}\n` +
    `Nuevo inicio: ${formatDateDisplay(newStart)}\n` +
    `Nuevo vencimiento: ${formatDateDisplay(newExpiry)}`;

  if (!window.confirm(confirmMsg)) return;

  mFormMessage.textContent = "";
  mFormMessage.className   = "form-message";

  try {
    let newRecord;
    if (MPTStorage.hasJwtSession()) {
      newRecord = await MPTStorage.renewMonthly(record.id);
    } else {
      newRecord = renewMonthlyLocal(record);
    }

    mFormMessage.textContent =
      `✅ Renovación exitosa: MEN-${newRecord.ticketNumber} | ${record.plate} | Vence: ${formatDateDisplay(newRecord.expiryDate)}`;
    mFormMessage.className = "form-message is-success";

    renderActiveSubscriptions();
    renderCalendar();
    renderHistory();
    renderMonthlyDrivers();

  } catch (err) {
    mFormMessage.textContent = err.message || "No fue posible renovar la mensualidad.";
    mFormMessage.className   = "form-message";
  }
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
    renderMonthlyDrivers();
  }

  closeExitModal();
});

// ================================================================
// MODAL: ELIMINAR CON VERIFICACION DE ROL
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
    renderMonthlyDrivers();
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
    renderMonthlyDrivers();
  }

  closeDeleteModal();
});

// ================================================================
// DELEGACION DE EVENTOS — TABLA ACTIVOS
// ================================================================

activeBody.addEventListener("click", (e) => {
  const renewBtn  = e.target.closest(".monthly-renew-btn");
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
// DELEGACION DE EVENTOS — TABLA HISTORICO
// ================================================================

historyTableWrap.addEventListener("click", (e) => {
  const deleteBtn = e.target.closest(".hist-delete-btn");

  if (deleteBtn) {
    pendingDelete = { type: "history", index: Number(deleteBtn.dataset.index) };
    openDeleteModal();
  }
});

// ================================================================
// DELEGACION DE EVENTOS — CONDUCTORES (tarjetas)
// ================================================================

monthlyDriversList.addEventListener("click", (e) => {
  const chargesBtn = e.target.closest(".manage-charges-btn");
  const renewBtn   = e.target.closest(".monthly-driver-renew-btn");

  if (chargesBtn) {
    const recordKey = chargesBtn.dataset.recordKey;
    const allRecords = [...getMonthlyRecords(), ...getMonthlyHistory()];
    const record = allRecords.find(
      (r) => String(r.id || `ticket-${r.ticketNumber}`) === String(recordKey)
    );
    if (record) openChargeModal(record);
    return;
  }

  if (renewBtn) {
    const recordKey = renewBtn.dataset.recordKey;
    const allRecords = [...getMonthlyRecords(), ...getMonthlyHistory()];
    const record = allRecords.find(
      (r) => String(r.id || `ticket-${r.ticketNumber}`) === String(recordKey)
    );
    if (record) handleRenew(record);
  }
});

// ================================================================
// DELEGACION DE EVENTOS — MODAL DE COBROS (lista de cobros)
// ================================================================

if (monthlyChargeModal) {
  monthlyChargeModal.addEventListener("click", (e) => {
    // Cerrar al hacer clic en el overlay
    if (e.target === monthlyChargeModal) { closeChargeModal(); return; }

    // Botones de estado de cobro
    const statusBtn = e.target.closest(".charge-status-btn");
    if (statusBtn) {
      handleChargeStatusUpdate(statusBtn.dataset.chargeId, statusBtn.dataset.status);
    }
  });
}

if (closeMonthlyCharge) {
  closeMonthlyCharge.addEventListener("click", closeChargeModal);
}

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
    responsible:  mResponsibleInput.value.trim(),
    document:     mDocumentInput.value.trim(),
    contact:      mContactInput.value.trim(),
    address:      mAddressInput.value.trim(),
    user:         MPTStorage.getActiveUserName(),
    createdAt:    new Date().toISOString(),
  };

  try {
    if (MPTStorage.hasJwtSession()) {
      const persisted = await MPTStorage.createMonthly(newRecord);
      newRecord.id           = persisted.id;
      newRecord.ticketNumber = persisted.ticketNumber;
      // El cobro se crea en el backend y se guarda en storage vía createMonthly
    } else {
      newRecord.id = `ticket-${newRecord.ticketNumber}-${Date.now()}`;
      records.unshift(newRecord);
      saveMonthlyRecords(records);

      // Crear cobro local automático
      if (MPTStorage.getMonthlyCharges && MPTStorage.saveMonthlyCharges) {
        const localCharges = MPTStorage.getMonthlyCharges();
        localCharges.unshift({
          id:           `charge-${Date.now()}`,
          monthlyId:    newRecord.id,
          ticketNumber: newRecord.ticketNumber,
          amount:       rateRaw,
          status:       "POR_COBRAR",
          paidAt:       null,
          createdAt:    new Date().toISOString(),
        });
        MPTStorage.saveMonthlyCharges(localCharges);
      }
    }
  } catch (error) {
    mFormMessage.textContent = error.message || 'No fue posible registrar la mensualidad en el servidor.';
    return;
  }

  mFormMessage.textContent = `Mensualidad MEN-${newRecord.ticketNumber} registrada para ${plate}. Vence: ${formatDateDisplay(expiryDate)}.`;
  mFormMessage.className   = "form-message is-success";
  monthlyForm.reset();
  mStartDateInput.value = getTodayStr();
  renderActiveSubscriptions();
  renderCalendar();
  renderMonthlyDrivers();
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

// Escape cierra modales
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!monthlyChargeModal.hidden) closeChargeModal();
});

// ================================================================
// INICIALIZACION
// ================================================================

async function init() {
  await MPTStorage.hydrateFromServer();
  mStartDateInput.value = getTodayStr();
  await checkExpiredSubscriptions();
  renderCalendar();
  renderActiveSubscriptions();
  renderHistory();
  renderMonthlyDrivers();
}

init();

// Refrescar estado en tiempo real cada 60 segundos
setInterval(async () => {
  await checkExpiredSubscriptions();
  renderActiveSubscriptions();
  renderCalendar();
  renderMonthlyDrivers();
}, 60000);

window.addEventListener('mpt:storage-hydrated', () => {
  renderCalendar();
  renderActiveSubscriptions();
  renderHistory();
  renderMonthlyDrivers();
});
