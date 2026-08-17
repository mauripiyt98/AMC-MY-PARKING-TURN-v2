// ============================================================
// reportes.js — Modulo de reporte de historicos
// My Parking Turn v2
//
// Dependencias (cargadas antes en el HTML):
//   1. session-guard.js  — proteccion de ruta
//   2. storage.js        — capa de datos SaaS
// ============================================================

// ===== Referencias DOM =====
const reportFilterForm       = document.querySelector("#reportFilterForm");
const startDateInput         = document.querySelector("#startDate");
const endDateInput           = document.querySelector("#endDate");
const clearReportFilter      = document.querySelector("#clearReportFilter");
const reportMessage          = document.querySelector("#reportMessage");
const summaryPeriod          = document.querySelector("#summaryPeriod");
const summaryTickets         = document.querySelector("#summaryTickets");
const summaryTotal           = document.querySelector("#summaryTotal");
const monthlyReports         = document.querySelector("#monthlyReports");
const deleteModal            = document.querySelector("#deleteModal");
const deleteForm             = document.querySelector("#deleteForm");
const developerPasswordInput = document.querySelector("#developerPassword");
const deleteMessage          = document.querySelector("#deleteMessage");
const cancelDelete           = document.querySelector("#cancelDelete");
const logoutButton           = document.querySelector("#logoutButton");
const ticketPreviewModal     = document.querySelector("#ticketPreviewModal");
const ticketPreviewDetails   = document.querySelector("#ticketPreviewDetails");
const closeTicketPreview     = document.querySelector("#closeTicketPreview");

// ===== Estado =====
let pendingDeleteIndex = null;

// ================================================================
// STORAGE — via capa MPTStorage (storage.js)
// ================================================================

function getRecords()      { return MPTStorage.getRecords(); }
function getHistory()      { return MPTStorage.getHistory(); }
function saveHistory(h)    { MPTStorage.saveHistory(h); }

function getStoredNextTicketNumber() { return MPTStorage.getStoredNextTicketNumber(); }
function saveNextTicketNumber(n)     { MPTStorage.saveNextTicketNumber(n); }

// ================================================================
// UTILIDADES Y FORMATO
// ================================================================

function formatCurrency(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTicket(ticketNumber) {
  return `TICKET ${ticketNumber || "SIN NUMERO"}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Conserva la misma regla de cobro/horas del registro de turnos activos.
function getCompletedHours(record) {
  const savedHours = Number(record.chargedHours);

  if (Number.isFinite(savedHours) && savedHours > 0) {
    return savedHours;
  }

  const entryDate = new Date(record.entryIso);
  const exitDate = new Date(record.exitIso);

  if (Number.isNaN(entryDate.getTime()) || Number.isNaN(exitDate.getTime())) {
    return 1;
  }

  const elapsedMilliseconds = Math.max(0, exitDate - entryDate);
  return Math.floor(elapsedMilliseconds / 3600000) + 1;
}

function getHighestTicketNumber(records, history) {
  return [...records, ...history].reduce((highestTicket, record) => {
    const ticketNumber = Number(record.ticketNumber || 0);

    if (!Number.isInteger(ticketNumber)) {
      return highestTicket;
    }

    return Math.max(highestTicket, ticketNumber);
  }, 0);
}

function migrateHistoryTicketNumbers() {
  const records = getRecords();
  const history = getHistory();
  let nextTicketNumber = Math.max(getStoredNextTicketNumber(), getHighestTicketNumber(records, history) + 1);
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

  if (didUpdateHistory) {
    saveHistory(history);
  }

  saveNextTicketNumber(Math.max(nextTicketNumber, getHighestTicketNumber(records, history) + 1));
}

function formatDateForDisplay(date) {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
  }).format(date);
}

function formatMonthForDisplay(date) {
  return new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
  }).format(date).toUpperCase();
}

function getLocalDateFromInput(value, endOfDay = false) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
}

function parseRecordDate(record) {
  if (record.exitIso) {
    const exitDate = new Date(record.exitIso);

    if (!Number.isNaN(exitDate.getTime())) {
      return exitDate;
    }
  }

  if (record.entryIso) {
    const entryDate = new Date(record.entryIso);

    if (!Number.isNaN(entryDate.getTime())) {
      return entryDate;
    }
  }

  const slashDate = String(record.date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashDate) {
    const [, day, month, year] = slashDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const spanishMonths = {
    ene: 0, enero: 0,
    feb: 1, febrero: 1,
    mar: 2, marzo: 2,
    abr: 3, abril: 3,
    may: 4, mayo: 4,
    jun: 5, junio: 5,
    jul: 6, julio: 6,
    ago: 7, agosto: 7,
    sep: 8, sept: 8, septiembre: 8,
    oct: 9, octubre: 9,
    nov: 10, noviembre: 10,
    dic: 11, diciembre: 11,
  };
  const textDate = String(record.date || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+de\s+/g, " ")
    .match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);

  if (textDate && spanishMonths[textDate[2]] !== undefined) {
    const [, day, monthName, year] = textDate;
    return new Date(Number(year), spanishMonths[monthName], Number(day));
  }

  const parsedDate = new Date(record.date);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  return null;
}

function getReportRows() {
  return getHistory()
    .map((record, index) => ({
      ...record,
      originalIndex: index,
      reportDate: parseRecordDate(record),
    }))
    .filter((record) => record.reportDate);
}

function getFilteredRows() {
  const startDate = getLocalDateFromInput(startDateInput.value);
  const endDate   = getLocalDateFromInput(endDateInput.value, true);

  if (startDate && endDate && startDate > endDate) {
    reportMessage.textContent = "La fecha inicial no puede ser mayor que la fecha final.";
    return [];
  }

  reportMessage.textContent = "";

  return getReportRows().filter((record) => {
    if (startDate && record.reportDate < startDate) {
      return false;
    }

    if (endDate && record.reportDate > endDate) {
      return false;
    }

    return true;
  });
}

function getPeriodLabel() {
  const startDate = getLocalDateFromInput(startDateInput.value);
  const endDate   = getLocalDateFromInput(endDateInput.value);

  if (startDate && endDate) {
    return `${formatDateForDisplay(startDate)} - ${formatDateForDisplay(endDate)}`;
  }

  if (startDate) {
    return `DESDE ${formatDateForDisplay(startDate)}`;
  }

  if (endDate) {
    return `HASTA ${formatDateForDisplay(endDate)}`;
  }

  return "TODOS LOS HISTORICOS";
}

function renderHistoryTable(rows) {
  const tableRows = rows
    .sort((first, second) => second.reportDate - first.reportDate)
    .map((record) => {
      const hourlyPrice  = Number(record.hourlyPrice || 0);
      const totalCharged = Number(record.totalCharged || 0);
      const originalTotal = record.originalTotalCharged !== undefined ? Number(record.originalTotalCharged) : totalCharged;
      const completedHours = getCompletedHours(record);
      
      let displayTotal = formatCurrency(totalCharged);
      if (originalTotal !== totalCharged) {
        displayTotal += `<br><small style="color:var(--color-muted); font-size:10px;">Orig: ${formatCurrency(originalTotal)}</small>`;
      }

      return `
        <tr>
          <td>${formatTicket(record.ticketNumber)}</td>
          <td>${record.plate}</td>
          <td>${record.entryTime || "SIN DATO"}</td>
          <td>${record.exitTime || "SIN DATO"}</td>
          <td>${formatDateForDisplay(record.reportDate)}</td>
          <td>${formatCurrency(hourlyPrice)}</td>
          <td>${displayTotal}</td>
          <td>${completedHours}</td>
          <td>${record.operatorName || record.user || 'SIN DATO'}</td>
          <td><button class="ticket-preview-action" type="button" data-index="${record.originalIndex}" aria-label="Ver ticket ${record.ticketNumber}">VER</button></td>
          <td><button class="pdf-action ticket-download-action" type="button" data-index="${record.originalIndex}" aria-label="Descargar PDF del ticket ${record.ticketNumber}">PDF</button></td>
          <td><button class="delete-action" type="button" data-index="${record.originalIndex}">ELIMINAR</button></td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="records-table-wrap report-table-wrap" tabindex="0" aria-label="Listado de turnos historicos">
      <table class="records-table report-history-table">
        <thead>
          <tr>
            <th scope="col">TICKET</th>
            <th scope="col">PLACA</th>
            <th scope="col">HORA INGRESO</th>
            <th scope="col">HORA SALIDA</th>
            <th scope="col">FECHA</th>
            <th scope="col">PRECIO HORA</th>
            <th scope="col">TOTAL COBRADO</th>
            <th scope="col">HORAS TOTALES</th>
            <th scope="col">OPERADOR</th>
            <th scope="col">VER</th>
            <th scope="col">PDF</th>
            <th scope="col">ELIMINAR</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function renderReport() {
  const rows          = getFilteredRows();
  const totalCharged  = rows.reduce((total, record) => total + Number(record.totalCharged || 0), 0);
  summaryPeriod.textContent  = getPeriodLabel();
  summaryTickets.textContent = String(rows.length);
  summaryTotal.textContent   = formatCurrency(totalCharged);

  if (rows.length === 0) {
    monthlyReports.innerHTML = `
      <div class="records-table-wrap report-table-wrap">
        <table class="records-table report-history-table">
          <tbody>
            <tr class="empty-record">
              <td colspan="12">NO HAY HISTORICOS EN EL PERIODO SELECCIONADO</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  monthlyReports.innerHTML = renderHistoryTable(rows);
}

function openHistoryTicketPreview(record) {
  if (!record) return;
  const details = [
    ['TICKET', formatTicket(record.ticketNumber)], ['PLACA', record.plate],
    ['VEHICULO', record.vehicleType || 'SIN DEFINIR'], ['FECHA', record.date || 'SIN DATO'],
    ['HORA INGRESO', record.entryTime || 'SIN DATO'], ['HORA SALIDA', record.exitTime || 'SIN DATO'],
    ['TARIFA POR HORA', formatCurrency(record.hourlyPrice)], ['HORAS COBRADAS', getCompletedHours(record)],
    ['TOTAL COBRADO', formatCurrency(record.totalCharged)], ['OPERADOR', record.operatorName || record.user || 'SIN DATO'],
    ['ESTADO', 'FINALIZADO'],
  ];
  ticketPreviewDetails.innerHTML = `<img class="ticket-preview-logo" src="../../assets/img/LOGOMPT.png" alt="Logo AMC My Parking Turn">${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}`;
  ticketPreviewModal.hidden = false;
  closeTicketPreview.focus();
}

// ================================================================
// MODAL: ELIMINAR CON VERIFICACION DE ROL
//
// Fase demo: verifica rol "admin" + formato de contrasena.
// TODO (fase backend): reemplazar por DELETE /api/history/:id
//   con Authorization: Bearer <token>.
// ================================================================

function openDeleteModal(index) {
  pendingDeleteIndex = index;
  deleteForm.reset();
  deleteMessage.textContent = "";
  deleteModal.hidden = false;
  developerPasswordInput.focus();
}

function closeDeleteModal() {
  pendingDeleteIndex = null;
  deleteModal.hidden = true;
  deleteForm.reset();
  deleteMessage.textContent = "";
}

async function deleteHistoryRecord(index) {
  const history = getHistory();
  const record  = history[index];

  if (!record) {
    closeDeleteModal();
    return;
  }

  try {
    if (MPTStorage.hasJwtSession()) {
      await MPTStorage.deleteTurn(record.id);
    } else {
      history.splice(index, 1);
      saveHistory(history);
    }
  } catch (error) {
    deleteMessage.textContent = error.message || 'No fue posible eliminar el histórico en el servidor.';
    return;
  }
  closeDeleteModal();
  reportMessage.textContent = `Registro historico eliminado para la placa ${record.plate}.`;
  renderReport();
}

// ================================================================
// EVENTOS
// ================================================================

reportFilterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderReport();
});

clearReportFilter.addEventListener("click", () => {
  reportFilterForm.reset();
  reportMessage.textContent = "";
  renderReport();
});

monthlyReports.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest(".delete-action");
  const previewButton = event.target.closest('.ticket-preview-action');
  const downloadButton = event.target.closest('.ticket-download-action');

  if (previewButton) {
    openHistoryTicketPreview(getHistory()[Number(previewButton.dataset.index)]);
    return;
  }

  if (downloadButton) {
    const record = getHistory()[Number(downloadButton.dataset.index)];
    if (!record || !window.MPTTicketPdf) return;
    try {
      const filename = await window.MPTTicketPdf.download(record);
      reportMessage.textContent = `PDF descargado localmente: ${filename}`;
    } catch (_error) {
      reportMessage.textContent = 'No fue posible generar el comprobante PDF con el logo.';
    }
    return;
  }

  if (!deleteButton) {
    return;
  }

  openDeleteModal(Number(deleteButton.dataset.index));
});

cancelDelete.addEventListener("click", closeDeleteModal);
closeTicketPreview.addEventListener('click', () => { ticketPreviewModal.hidden = true; });
ticketPreviewModal.addEventListener('click', (event) => { if (event.target === ticketPreviewModal) ticketPreviewModal.hidden = true; });

deleteModal.addEventListener("click", (event) => {
  if (event.target === deleteModal) {
    closeDeleteModal();
  }
});

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

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

  await deleteHistoryRecord(pendingDeleteIndex);
});

logoutButton.addEventListener("click", () => {
  MPTStorage.clearSession();
  window.location.href = "../../index.html";
});

// ================================================================
// INICIALIZACION
// ================================================================

async function initReport() {
  await MPTStorage.hydrateFromServer();
  migrateHistoryTicketNumbers();
  renderReport();
}

initReport();
window.addEventListener('mpt:storage-hydrated', renderReport);
