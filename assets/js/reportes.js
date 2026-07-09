const reportFilterForm = document.querySelector("#reportFilterForm");
const startDateInput = document.querySelector("#startDate");
const endDateInput = document.querySelector("#endDate");
const clearReportFilter = document.querySelector("#clearReportFilter");
const reportMessage = document.querySelector("#reportMessage");
const summaryPeriod = document.querySelector("#summaryPeriod");
const summaryTickets = document.querySelector("#summaryTickets");
const summaryTotal = document.querySelector("#summaryTotal");
const monthlyReports = document.querySelector("#monthlyReports");
const deleteModal = document.querySelector("#deleteModal");
const deleteForm = document.querySelector("#deleteForm");
const developerPasswordInput = document.querySelector("#developerPassword");
const deleteMessage = document.querySelector("#deleteMessage");
const cancelDelete = document.querySelector("#cancelDelete");
const logoutButton = document.querySelector("#logoutButton");
const recordsStorageKey = "mptPlateRecords";
const historyStorageKey = "mptPlateHistory";
const nextTicketStorageKey = "mptNextTicketNumber";
const developerDeletePassword = "Amc2026*";
let pendingDeleteIndex = null;

function getRecords() {
  return JSON.parse(localStorage.getItem(recordsStorageKey) || "[]");
}

function getHistory() {
  return JSON.parse(localStorage.getItem(historyStorageKey) || "[]");
}

function saveHistory(history) {
  localStorage.setItem(historyStorageKey, JSON.stringify(history));
}

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

function getStoredNextTicketNumber() {
  const storedNextTicketNumber = Number(localStorage.getItem(nextTicketStorageKey));

  if (!Number.isInteger(storedNextTicketNumber) || storedNextTicketNumber < 1) {
    return 1;
  }

  return storedNextTicketNumber;
}

function saveNextTicketNumber(ticketNumber) {
  localStorage.setItem(nextTicketStorageKey, String(ticketNumber));
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
    ene: 0,
    enero: 0,
    feb: 1,
    febrero: 1,
    mar: 2,
    marzo: 2,
    abr: 3,
    abril: 3,
    may: 4,
    mayo: 4,
    jun: 5,
    junio: 5,
    jul: 6,
    julio: 6,
    ago: 7,
    agosto: 7,
    sep: 8,
    sept: 8,
    septiembre: 8,
    oct: 9,
    octubre: 9,
    nov: 10,
    noviembre: 10,
    dic: 11,
    diciembre: 11,
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
  const endDate = getLocalDateFromInput(endDateInput.value, true);

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
  const endDate = getLocalDateFromInput(endDateInput.value);

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

function groupRowsByMonth(rows) {
  return rows.reduce((groups, record) => {
    const monthKey = `${record.reportDate.getFullYear()}-${String(record.reportDate.getMonth() + 1).padStart(2, "0")}`;

    if (!groups.has(monthKey)) {
      groups.set(monthKey, {
        monthDate: new Date(record.reportDate.getFullYear(), record.reportDate.getMonth(), 1),
        records: [],
      });
    }

    groups.get(monthKey).records.push(record);
    return groups;
  }, new Map());
}

function renderMonthlyTable(group) {
  const monthTotal = group.records.reduce((total, record) => total + Number(record.totalCharged || 0), 0);
  const rows = group.records
    .map((record) => {
      const hourlyPrice = Number(record.hourlyPrice || 0);
      const totalCharged = Number(record.totalCharged || 0);

      return `
        <tr>
          <td>${formatTicket(record.ticketNumber)}</td>
          <td>${record.plate}</td>
          <td>${record.entryTime || "SIN DATO"}</td>
          <td>${record.exitTime || "SIN DATO"}</td>
          <td>${formatDateForDisplay(record.reportDate)}</td>
          <td>${formatCurrency(hourlyPrice)}</td>
          <td>${formatCurrency(totalCharged)}</td>
          <td><button class="delete-action" type="button" data-index="${record.originalIndex}">ELIMINAR</button></td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="month-report">
      <header>
        <h3>${formatMonthForDisplay(group.monthDate)}</h3>
        <p>${group.records.length} tickets | ${formatCurrency(monthTotal)}</p>
      </header>
      <div class="records-table-wrap">
        <table class="records-table">
          <thead>
            <tr>
              <th scope="col">TICKET</th>
              <th scope="col">PLACA</th>
              <th scope="col">HORA INGRESO</th>
              <th scope="col">HORA SALIDA</th>
              <th scope="col">FECHA</th>
              <th scope="col">PRECIO HORA</th>
              <th scope="col">TOTAL COBRADO</th>
              <th scope="col">ELIMINAR</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderReport() {
  const rows = getFilteredRows();
  const totalCharged = rows.reduce((total, record) => total + Number(record.totalCharged || 0), 0);
  const monthlyGroups = [...groupRowsByMonth(rows).values()].sort((a, b) => b.monthDate - a.monthDate);

  summaryPeriod.textContent = getPeriodLabel();
  summaryTickets.textContent = String(rows.length);
  summaryTotal.textContent = formatCurrency(totalCharged);

  if (rows.length === 0) {
    monthlyReports.innerHTML = `
      <div class="records-table-wrap">
        <table class="records-table">
          <tbody>
            <tr class="empty-record">
              <td>NO HAY HISTORICOS EN EL PERIODO SELECCIONADO</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  monthlyReports.innerHTML = monthlyGroups.map(renderMonthlyTable).join("");
}

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

function deleteHistoryRecord(index) {
  const history = getHistory();
  const record = history[index];

  if (!record) {
    closeDeleteModal();
    return;
  }

  history.splice(index, 1);
  saveHistory(history);
  closeDeleteModal();
  reportMessage.textContent = `Registro historico eliminado para la placa ${record.plate}.`;
  renderReport();
}

reportFilterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderReport();
});

clearReportFilter.addEventListener("click", () => {
  reportFilterForm.reset();
  reportMessage.textContent = "";
  renderReport();
});

monthlyReports.addEventListener("click", (event) => {
  const deleteButton = event.target.closest(".delete-action");

  if (!deleteButton) {
    return;
  }

  openDeleteModal(Number(deleteButton.dataset.index));
});

cancelDelete.addEventListener("click", closeDeleteModal);

deleteModal.addEventListener("click", (event) => {
  if (event.target === deleteModal) {
    closeDeleteModal();
  }
});

deleteForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (developerPasswordInput.value !== developerDeletePassword) {
    deleteMessage.textContent = "Contrasena de usuario desarrollador incorrecta.";
    developerPasswordInput.focus();
    return;
  }

  deleteHistoryRecord(pendingDeleteIndex);
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem("mptUser");
  sessionStorage.removeItem("mptUserName");
  window.location.href = "../../index.html";
});

migrateHistoryTicketNumbers();
renderReport();
