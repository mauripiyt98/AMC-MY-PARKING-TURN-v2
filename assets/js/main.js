const entryDateTime = document.querySelector("#entryDateTime");
const plateForm = document.querySelector("#plateForm");
const placaInput = document.querySelector("#placa");
const plateMessage = document.querySelector("#plateMessage");
const vehicleTypeInputs = document.querySelectorAll('input[name="vehicleType"]');
const activePlateFilterInput = document.querySelector("#activePlateFilter");
const recordsBody = document.querySelector("#recordsBody");
const exitModal = document.querySelector("#exitModal");
const exitModalText = document.querySelector("#exitModalText");
const cancelExit = document.querySelector("#cancelExit");
const confirmExit = document.querySelector("#confirmExit");
const chargeModal = document.querySelector("#chargeModal");
const chargePlate = document.querySelector("#chargePlate");
const chargeDate = document.querySelector("#chargeDate");
const chargeEntryTime = document.querySelector("#chargeEntryTime");
const chargeExitTime = document.querySelector("#chargeExitTime");
const chargeTotal = document.querySelector("#chargeTotal");
const closeCharge = document.querySelector("#closeCharge");
const generatePdfButton = document.querySelector("#generatePdfButton");
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
let pendingExitIndex = null;
let pendingDelete = null;

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

function getSelectedVehicle() {
  const selectedVehicle = [...vehicleTypeInputs].find((input) => input.checked);

  if (!selectedVehicle) {
    return null;
  }

  return {
    type: selectedVehicle.dataset.label,
    price: Number(selectedVehicle.dataset.price),
  };
}

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
  const hourlyPrice = Number(record.hourlyPrice || 0);

  return {
    chargedHours,
    hourlyPrice,
    totalCharged: chargedHours * hourlyPrice,
  };
}

function getRecords() {
  return JSON.parse(localStorage.getItem(recordsStorageKey) || "[]");
}

function getHistory() {
  return JSON.parse(localStorage.getItem(historyStorageKey) || "[]");
}

function saveRecords(records) {
  localStorage.setItem(recordsStorageKey, JSON.stringify(records));
}

function saveHistory(history) {
  localStorage.setItem(historyStorageKey, JSON.stringify(history));
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

function migrateTicketNumbers() {
  const records = getRecords();
  const history = getHistory();
  let nextTicketNumber = Math.max(getStoredNextTicketNumber(), getHighestTicketNumber(records, history) + 1);
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
    saveRecords(records);
  }

  if (didUpdateHistory) {
    saveHistory(history);
  }

  saveNextTicketNumber(Math.max(nextTicketNumber, getHighestTicketNumber(records, history) + 1));
}

function getNextTicketNumber() {
  const records = getRecords();
  const history = getHistory();
  const nextTicketNumber = Math.max(getStoredNextTicketNumber(), getHighestTicketNumber(records, history) + 1);

  saveNextTicketNumber(nextTicketNumber + 1);
  return nextTicketNumber;
}

function getActiveUserName() {
  return sessionStorage.getItem("mptUserName") || "USUARIO NO IDENTIFICADO";
}

function renderRecords() {
  const records = getRecords();
  const plateFilter = activePlateFilterInput.value.trim().toUpperCase();
  const filteredRecords = plateFilter
    ? records
        .map((record, index) => ({ record, index }))
        .filter(({ record }) => normalizePlate(record.plate).includes(plateFilter))
    : records.map((record, index) => ({ record, index }));

  recordsBody.innerHTML = "";

  if (records.length === 0) {
    recordsBody.innerHTML = '<tr class="empty-record"><td colspan="9">AUN NO HAY TURNOS REGISTRADOS</td></tr>';
    return;
  }

  if (filteredRecords.length === 0) {
    recordsBody.innerHTML = '<tr class="empty-record"><td colspan="9">NO HAY TURNOS ACTIVOS PARA ESA PLACA</td></tr>';
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
      <td>${record.user}</td>
      <td><button class="exit-action" type="button" data-index="${index}">SALIDA</button></td>
      <td><button class="delete-action" type="button" data-type="active" data-index="${index}">ELIMINAR</button></td>
    `;
    recordsBody.appendChild(row);
  });
}

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

function deleteActiveRecord(index) {
  const records = getRecords();
  const record = records[index];

  if (!record) {
    return;
  }

  records.splice(index, 1);
  saveRecords(records);
  renderRecords();
  plateMessage.textContent = `Registro activo eliminado para la placa ${record.plate}.`;
}

function confirmDeleteWithDeveloperPassword(password) {
  if (password !== developerDeletePassword) {
    deleteMessage.textContent = "Contrasena de usuario desarrollador incorrecta.";
    developerPasswordInput.focus();
    return;
  }

  if (!pendingDelete) {
    closeDeleteModal();
    return;
  }

  if (pendingDelete.type === "active") {
    deleteActiveRecord(pendingDelete.index);
  }

  closeDeleteModal();
}

function openExitModal(recordIndex) {
  const records = getRecords();
  const record = records[recordIndex];

  if (!record) {
    return;
  }

  const charge = getExitCharge(record, new Date());

  pendingExitIndex = recordIndex;
  exitModalText.textContent = `Placa ${record.plate} | Total a cobrar: ${formatCurrency(charge.totalCharged)}`;
  exitModal.hidden = false;
  confirmExit.focus();
}

function closeExitModal() {
  pendingExitIndex = null;
  exitModal.hidden = true;
  exitModalText.textContent = "";
}

function openChargeModal(chargeReceipt) {
  chargePlate.textContent = chargeReceipt.plate;
  chargeDate.textContent = chargeReceipt.date;
  chargeEntryTime.textContent = chargeReceipt.entryTime;
  chargeExitTime.textContent = chargeReceipt.exitTime;
  chargeTotal.textContent = formatCurrency(chargeReceipt.totalCharged);
  chargeModal.hidden = false;
  closeCharge.focus();
}

function closeChargeModal() {
  chargeModal.hidden = true;
  chargePlate.textContent = "";
  chargeDate.textContent = "";
  chargeEntryTime.textContent = "";
  chargeExitTime.textContent = "";
  chargeTotal.textContent = "";
}

function registerExit(recordIndex) {
  const records = getRecords();
  const record = records[recordIndex];

  if (!record) {
    return;
  }

  const now = new Date();
  const exitTime = formatTime(now);
  const { chargedHours, hourlyPrice, totalCharged } = getExitCharge(record, now);
  const history = getHistory();
  const chargeReceipt = {
    plate: record.plate,
    date: record.date,
    entryTime: record.time,
    exitTime,
    totalCharged,
  };

  history.unshift({
    plate: record.plate,
    ticketNumber: record.ticketNumber,
    entryIso: record.entryIso,
    exitIso: now.toISOString(),
    entryTime: record.time,
    exitTime,
    date: record.date,
    hourlyPrice,
    chargedHours,
    totalCharged,
  });

  records.splice(recordIndex, 1);
  saveRecords(records);
  saveHistory(history);
  renderRecords();
  plateMessage.textContent = `Salida generada para ${record.plate}. Total cobrado: ${formatCurrency(totalCharged)}.`;
  return chargeReceipt;
}

function refreshDateTime() {
  entryDateTime.textContent = formatDateTime(new Date());
}

refreshDateTime();
migrateTicketNumbers();
renderRecords();
setInterval(refreshDateTime, 1000);

placaInput.addEventListener("input", () => {
  placaInput.value = normalizePlate(placaInput.value);
  plateMessage.textContent = "";
});

activePlateFilterInput.addEventListener("input", () => {
  activePlateFilterInput.value = normalizePlate(activePlateFilterInput.value);
  renderRecords();
});

recordsBody.addEventListener("click", (event) => {
  const exitButton = event.target.closest(".exit-action");
  const deleteButton = event.target.closest(".delete-action");

  if (deleteButton) {
    openDeleteModal(deleteButton.dataset.type, Number(deleteButton.dataset.index));
    return;
  }

  if (exitButton) {
    openExitModal(Number(exitButton.dataset.index));
  }
});

cancelExit.addEventListener("click", closeExitModal);

confirmExit.addEventListener("click", () => {
  if (pendingExitIndex === null) {
    closeExitModal();
    return;
  }

  const chargeReceipt = registerExit(pendingExitIndex);
  closeExitModal();

  if (chargeReceipt) {
    openChargeModal(chargeReceipt);
  }
});

exitModal.addEventListener("click", (event) => {
  if (event.target === exitModal) {
    closeExitModal();
  }
});

closeCharge.addEventListener("click", closeChargeModal);

generatePdfButton.addEventListener("click", () => {
  plateMessage.textContent = "La generacion de PDF se conectara en una siguiente etapa.";
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

deleteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  confirmDeleteWithDeveloperPassword(developerPasswordInput.value);
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem("mptUser");
  sessionStorage.removeItem("mptUserName");
  window.location.href = "../index.html";
});

plateForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!placaInput.value.trim()) {
    plateMessage.textContent = "Ingresa la placa para generar el turno.";
    placaInput.focus();
    return;
  }

  const plate = normalizePlate(placaInput.value);
  const records = getRecords();
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
    entryIso: now.toISOString(),
    date: formatDate(now),
    time: formatTime(now),
    vehicleType: selectedVehicle.type,
    hourlyPrice: selectedVehicle.price,
    user: getActiveUserName(),
  };

  records.unshift(plateRecord);
  saveRecords(records);
  renderRecords();

  plateMessage.textContent = `${formatTicket(plateRecord.ticketNumber)} generado para ${plate} con tarifa ${formatCurrency(selectedVehicle.price)}.`;
  placaInput.value = "";
  vehicleTypeInputs.forEach((input) => {
    input.checked = false;
  });
  placaInput.focus();
});
