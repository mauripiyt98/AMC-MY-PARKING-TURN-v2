'use strict';

const PROFILE_API_BASE = window.MPT_API_BASE || '/api';
const profileForm = document.getElementById('parkingProfileForm');
const profileMessage = document.getElementById('profileMessage');
const profileFields = {
  nombreUsuario: document.getElementById('profileUserName'),
  documento: document.getElementById('profileDocument'),
  nombreComercial: document.getElementById('profileCommercialName'),
  ciudad: document.getElementById('profileCity'),
  departamento: document.getElementById('profileDepartment'),
  correo: document.getElementById('profileEmail'),
  celular: document.getElementById('profileCelular'),
  direccion: document.getElementById('profileAddress'),
};

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

function showProfileMessage(message, type = 'error') {
  profileMessage.textContent = message;
  profileMessage.classList.toggle('is-success', type === 'success');
}

function getProfileFromForm() {
  return Object.fromEntries(
    Object.entries(profileFields).map(([key, input]) => [key, input.value.trim()])
  );
}

function fillProfile(profile) {
  profileFields.nombreUsuario.value = profile.nombreUsuario || sessionStorage.getItem('mptUserName') || '';
  profileFields.documento.value = profile.documento || sessionStorage.getItem('mptUser') || '';
  profileFields.nombreComercial.value = profile.nombreComercial || '';
  profileFields.ciudad.value = profile.ciudad || '';
  profileFields.departamento.value = profile.departamento || '';
  profileFields.correo.value = profile.correo || '';
  profileFields.celular.value = profile.celular || '';
  profileFields.direccion.value = profile.direccion || '';
}

async function requestProfile(path, options = {}) {
  const response = await fetch(`${PROFILE_API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getJwtToken()}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'No fue posible guardar el perfil en el servidor.');
  return data;
}

async function loadProfile() {
  const localProfile = MPTStorage.getParkingProfile() || {};
  let profile = { ...localProfile };

  if (hasBackendSession()) {
    try {
      const tenantId = MPTStorage.getActiveTenantId();
      const [{ parqueadero }, { usuario }] = await Promise.all([
        requestProfile(`/parqueaderos/${tenantId}`),
        requestProfile('/auth/me'),
      ]);
      profile = {
        ...profile,
        nombreUsuario: usuario.nombre || profile.nombreUsuario,
        documento: usuario.documento || profile.documento,
        correo: usuario.email || profile.correo,
        nombreComercial: parqueadero.nombre || profile.nombreComercial,
        ciudad: parqueadero.ciudad || profile.ciudad,
        departamento: parqueadero.departamento || profile.departamento,
        correo: parqueadero.email || profile.correo,
        direccion: parqueadero.direccion || profile.direccion,
      };
    } catch {
      // El modo local sigue disponible si el servidor no está en ejecución.
    }
  }

  fillProfile(profile);
}

profileFields.documento.addEventListener('input', () => {
  profileFields.documento.value = profileFields.documento.value.replace(/\D/g, '').slice(0, 20);
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const profile = getProfileFromForm();

  // Campos obligatorios (celular es opcional)
  const requiredFields = ['nombreUsuario', 'documento', 'nombreComercial', 'ciudad', 'departamento', 'correo', 'direccion'];
  if (!requiredFields.every((key) => Boolean(profile[key]))) {
    showProfileMessage('Completa todos los campos obligatorios para guardar tu perfil.');
    return;
  }
  if (!/^\d{5,20}$/.test(profile.documento)) {
    showProfileMessage('El número de documento debe contener entre 5 y 20 dígitos.');
    profileFields.documento.focus();
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.correo)) {
    showProfileMessage('Ingresa un correo electrónico válido.');
    profileFields.correo.focus();
    return;
  }

  const submitButton = profileForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showProfileMessage('');

  try {
    if (hasBackendSession()) {
      const tenantId = MPTStorage.getActiveTenantId();
      await Promise.all([
        requestProfile(`/parqueaderos/${tenantId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            nombre: profile.nombreComercial,
            ciudad: profile.ciudad,
            departamento: profile.departamento,
            email: profile.correo,
            direccion: profile.direccion,
          }),
        }),
        requestProfile('/auth/me', {
          method: 'PATCH',
          body: JSON.stringify({ nombre: profile.nombreUsuario, email: profile.correo }),
        }),
      ]);
    }

    MPTStorage.saveParkingProfile(profile);
    sessionStorage.setItem('mptUserName', profile.nombreUsuario);
    showProfileMessage('Perfil guardado correctamente.', 'success');
  } catch (error) {
    showProfileMessage(error.message || 'No fue posible guardar el perfil.');
  } finally {
    submitButton.disabled = false;
  }
});

loadProfile();
