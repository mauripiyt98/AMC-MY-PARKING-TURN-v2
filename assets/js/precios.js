'use strict';

const PRICES_API_BASE = 'http://localhost:3000/api';
const pricesForm = document.getElementById('pricesForm');
const motoInput = document.getElementById('motoHourlyPrice');
const carInput = document.getElementById('carHourlyPrice');
const pricesMessage = document.getElementById('pricesMessage');

function getJwtToken() {
  try {
    return JSON.parse(sessionStorage.getItem('mptSessionV2') || '{}').token || '';
  } catch {
    return '';
  }
}

function hasBackendSession() {
  return Boolean(getJwtToken());
}

function showMessage(message, type = 'error') {
  pricesMessage.textContent = message;
  pricesMessage.classList.toggle('is-success', type === 'success');
}

function priceValue(input) {
  return Number(input.value);
}

async function requestPrices(path, options = {}) {
  const response = await fetch(`${PRICES_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getJwtToken()}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible guardar las tarifas en el servidor.');
  return data;
}

async function loadPrices() {
  let prices = MPTStorage.getParkingPrices();

  if (hasBackendSession()) {
    try {
      const tenantId = MPTStorage.getActiveTenantId();
      const { parqueadero } = await requestPrices(`/parqueaderos/${tenantId}`);
      if (Number.isInteger(parqueadero.tarifa_moto_hora) && Number.isInteger(parqueadero.tarifa_carro_hora)) {
        prices = { moto: parqueadero.tarifa_moto_hora, carro: parqueadero.tarifa_carro_hora };
        MPTStorage.saveParkingPrices(prices);
      }
    } catch {
      // Si el backend no está disponible, se usan las tarifas locales del parqueadero.
    }
  }

  motoInput.value = prices.moto;
  carInput.value = prices.carro;
}

pricesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prices = { moto: priceValue(motoInput), carro: priceValue(carInput) };

  if (![prices.moto, prices.carro].every((price) => Number.isInteger(price) && price > 0 && price <= 9999999)) {
    showMessage('Ingresa valores enteros entre $1 y $9.999.999 para cada tarifa.');
    return;
  }

  const submitButton = pricesForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showMessage('');

  try {
    if (hasBackendSession()) {
      const tenantId = MPTStorage.getActiveTenantId();
      await requestPrices(`/parqueaderos/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify({ tarifa_moto_hora: prices.moto, tarifa_carro_hora: prices.carro }),
      });
    }
    MPTStorage.saveParkingPrices(prices);
    showMessage('Tarifas guardadas. Se aplicarán a los nuevos turnos.', 'success');
  } catch (error) {
    showMessage(error.message || 'No fue posible guardar las tarifas.');
  } finally {
    submitButton.disabled = false;
  }
});

loadPrices();
