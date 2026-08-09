'use strict';

/* ============================================================
   soporte.js — Módulo de Soporte / My Parking Turn v2

   MODO GUEST  (?guest=1 en la URL o sin sesión activa):
     → Viene del login sin sesión iniciada
     → Los campos de datos del cliente son editables (texto libre)
     → El botón "Volver" regresa al login

   MODO SESIÓN (URL normal desde principal.html con sesión activa):
     → Los campos se auto-cargan del perfil y son de solo lectura
     → El botón "Volver" regresa a principal.html

   ─────────────────────────────────────────────────────────────
   ENVÍO DE CORREO: Web3Forms (web3forms.com)
   ─────────────────────────────────────────────────────────────
   CONFIGURACIÓN — UN SOLO PASO:
     1. Ve a https://web3forms.com
     2. Escribe tu correo: servicios@amcparqueadero.online
     3. Haz clic en "Get your Access Key"
     4. Revisa tu bandeja: llega un código (Access Key) al instante
     5. Pega ese código en WEB3FORMS_ACCESS_KEY aquí abajo

   ✅ Solo esa clave es suficiente. No se necesita nada más.
   ─────────────────────────────────────────────────────────────
   ============================================================ */

/* ══════════════════════════════════════════
   ★ ÚNICA CONFIGURACIÓN NECESARIA
   ══════════════════════════════════════════ */
const WEB3FORMS_ACCESS_KEY = 'TU_ACCESS_KEY_AQUI';
// Ejemplo real:  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
// Obtener en:    https://web3forms.com  → ingresa servicios@amcparqueadero.online
const WEB3FORMS_ENDPOINT   = 'https://api.web3forms.com/submit';

/* ══════════════════════════════════════════
   DETECCIÓN DE MODO: GUEST vs. SESIÓN
   ══════════════════════════════════════════ */
const urlParams = new URLSearchParams(window.location.search);
const IS_GUEST  = urlParams.get('guest') === '1';

function hasActiveSession() {
  try {
    const raw = sessionStorage.getItem('mptSessionV2');
    if (raw) {
      const session = JSON.parse(raw);
      if (session && session.token) {
        const parts   = session.token.split('.');
        const payload = parts.length === 3 ? JSON.parse(atob(parts[1])) : {};
        if (payload.exp && payload.exp > Math.floor(Date.now() / 1000) + 30) return true;
      }
    }
  } catch { /* ignorar */ }
  const user   = sessionStorage.getItem('mptUser');
  const token  = sessionStorage.getItem('mptSessionToken');
  const legacy = sessionStorage.getItem('mptSessionActive');
  return !!(user && token) || legacy === 'true';
}

// Modo definitivo: guest si viene con ?guest=1 O si no hay sesión activa
const GUEST_MODE = IS_GUEST || !hasActiveSession();

/* ══════════════════════════════════════════
   NÚMERO DE RADICADO GLOBAL
   ══════════════════════════════════════════ */
const SUPPORT_TICKET_KEY = 'mptSupportTicketCounter';

function getNextSupportTicketNumber() {
  const stored = parseInt(localStorage.getItem(SUPPORT_TICKET_KEY) || '0', 10);
  return (Number.isInteger(stored) && stored >= 0 ? stored : 0) + 1;
}

function saveNextSupportTicketNumber(n) {
  localStorage.setItem(SUPPORT_TICKET_KEY, String(n));
}

function formatTicketNumber(n) {
  return 'TICKET' + String(Math.min(n, 99999)).padStart(5, '0');
}

/* ── Cargar datos del perfil (modo sesión) ── */
function loadProfileData() {
  const profile = (typeof MPTStorage !== 'undefined' && MPTStorage.getParkingProfile)
    ? (MPTStorage.getParkingProfile() || {})
    : {};
  return {
    nombre:    profile.nombreUsuario || sessionStorage.getItem('mptUserName') || '',
    documento: profile.documento     || sessionStorage.getItem('mptUser')     || '',
    correo:    profile.correo        || '',
    celular:   profile.celular       || '',
  };
}

function formatFecha() {
  return new Date().toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/* ══════════════════════════════════════════
   ELEMENTOS DEL DOM
   ══════════════════════════════════════════ */
const backLink         = document.getElementById('soporteBackLink');
const form             = document.getElementById('soporteForm');
const inputNombre      = document.getElementById('soporteNombre');
const inputDocumento   = document.getElementById('soporteDocumento');
const inputCorreo      = document.getElementById('soporteCorreo');
const inputCelular     = document.getElementById('soporteCelular');
const inputDescripcion = document.getElementById('soporteDescripcion');
const charCount        = document.getElementById('charCount');
const soporteMessage   = document.getElementById('soporteMessage');
const btnEnviar        = document.getElementById('btnEnviarSolicitud');
const panelHeadingP    = document.querySelector('.soporte-panel-heading p');

// Modal previsualización
const previewModal     = document.getElementById('previewModal');
const pvTicket         = document.getElementById('previewTicketNumber');
const pvFecha          = document.getElementById('previewFecha');
const pvNombre         = document.getElementById('pvNombre');
const pvDocumento      = document.getElementById('pvDocumento');
const pvCorreo         = document.getElementById('pvCorreo');
const pvCelular        = document.getElementById('pvCelular');
const pvDescripcion    = document.getElementById('pvDescripcion');
const sendStatus       = document.getElementById('previewSendStatus');
const btnConfirmar     = document.getElementById('btnConfirmarEnvio');
const btnCerrarPreview = document.getElementById('btnCerrarPreview');

// Modal éxito
const successModal     = document.getElementById('successModal');
const successTicket    = document.getElementById('successTicketDisplay');
const btnCerrarExito   = document.getElementById('btnCerrarExito');

/* ══════════════════════════════════════════
   INICIALIZACIÓN
   ══════════════════════════════════════════ */
(function init() {

  /* ── Botón Volver según modo ── */
  if (GUEST_MODE) {
    backLink.href      = '../../index.html';
    backLink.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="15 18 9 12 15 6"/></svg> VOLVER AL LOGIN';
  } else {
    backLink.href      = '../principal.html';
    backLink.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="15 18 9 12 15 6"/></svg> VOLVER A TURNOS';
  }

  /* ── MODO GUEST: campos editables ── */
  if (GUEST_MODE) {
    [inputNombre, inputDocumento, inputCorreo, inputCelular].forEach((el) => {
      el.removeAttribute('readonly');
      el.required = true;
    });
    inputNombre.placeholder    = 'Ej.: Juan Pérez';
    inputDocumento.placeholder = 'Ej.: 1234567890';
    inputCorreo.placeholder    = 'tu@correo.com';
    inputCelular.placeholder   = 'Ej.: 3001234567';

    if (panelHeadingP) {
      panelHeadingP.innerHTML =
        '<span class="soporte-guest-badge">👤 MODO INVITADO</span> ' +
        'Completa manualmente tus datos para que el equipo de soporte pueda contactarte.';
    }

  } else {
    /* ── MODO SESIÓN: auto-cargar perfil, campos solo lectura ── */
    const data = loadProfileData();
    inputNombre.value    = data.nombre;
    inputDocumento.value = data.documento;
    inputCorreo.value    = data.correo;
    inputCelular.value   = data.celular;

    if (panelHeadingP) {
      panelHeadingP.innerHTML =
        '<span class="soporte-session-badge">✅ SESIÓN ACTIVA</span> ' +
        'Los campos marcados con <span class="soporte-required-mark">★</span> se cargan automáticamente de tu perfil.';
    }
  }
})();

/* ── Contador de caracteres ── */
inputDescripcion.addEventListener('input', () => {
  charCount.textContent = inputDescripcion.value.length;
});

/* ══════════════════════════════════════════
   VALIDACIÓN
   ══════════════════════════════════════════ */
function showMsg(text, type = 'error') {
  soporteMessage.textContent = text;
  soporteMessage.className   = 'soporte-message' + (type === 'success' ? ' is-success' : '');
}

function validateFields() {
  if (GUEST_MODE) {
    if (!inputNombre.value.trim()) {
      showMsg('Por favor ingresa tu nombre completo.');
      inputNombre.focus(); return false;
    }
    if (!inputDocumento.value.trim()) {
      showMsg('Por favor ingresa tu número de identificación.');
      inputDocumento.focus(); return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inputCorreo.value.trim())) {
      showMsg('Ingresa un correo electrónico válido.');
      inputCorreo.focus(); return false;
    }
    if (!inputCelular.value.trim()) {
      showMsg('Por favor ingresa tu número de celular.');
      inputCelular.focus(); return false;
    }
  }
  const desc = inputDescripcion.value.trim();
  if (!desc) {
    showMsg('Por favor describe tu solicitud antes de continuar.');
    inputDescripcion.focus(); return false;
  }
  if (desc.length < 10) {
    showMsg('La descripción es muy corta. Agrega más detalles.');
    inputDescripcion.focus(); return false;
  }
  return true;
}

/* ══════════════════════════════════════════
   SUBMIT → abrir previsualización
   ══════════════════════════════════════════ */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  showMsg('');
  if (!validateFields()) return;

  const ticketNum  = getNextSupportTicketNumber();
  const ticketCode = formatTicketNumber(ticketNum);
  const fechaStr   = formatFecha();
  const modoAcceso = GUEST_MODE ? 'Sin sesión (invitado)' : 'Con sesión activa';

  pvTicket.textContent      = ticketCode;
  pvFecha.textContent       = fechaStr;
  pvNombre.textContent      = inputNombre.value.trim()    || '—';
  pvDocumento.textContent   = inputDocumento.value.trim() || '—';
  pvCorreo.textContent      = inputCorreo.value.trim()    || '—';
  pvCelular.textContent     = inputCelular.value.trim()   || '—';
  pvDescripcion.textContent = inputDescripcion.value.trim();
  sendStatus.textContent    = '';
  sendStatus.className      = 'soporte-send-status';

  previewModal.dataset.ticketNum   = ticketNum;
  previewModal.dataset.ticketCode  = ticketCode;
  previewModal.dataset.fecha       = fechaStr;
  previewModal.dataset.descripcion = inputDescripcion.value.trim();
  previewModal.dataset.modoAcceso  = modoAcceso;

  previewModal.hidden          = false;
  document.body.style.overflow = 'hidden';
  btnConfirmar.focus();
});

/* ══════════════════════════════════════════
   ENVIAR VÍA WEB3FORMS
   ══════════════════════════════════════════ */
async function enviarPorWeb3Forms(params) {
  const keyConfigurada = WEB3FORMS_ACCESS_KEY !== 'TU_ACCESS_KEY_AQUI' && WEB3FORMS_ACCESS_KEY.length > 10;

  if (!keyConfigurada) {
    // Respaldo: abrir cliente de correo local
    const subject = encodeURIComponent(`[${params.ticket_number}] Solicitud de Soporte – ${params.nombre}`);
    const body    = encodeURIComponent(
      `NÚMERO DE RADICADO: ${params.ticket_number}\n` +
      `FECHA: ${params.fecha}\n` +
      `MODO: ${params.modo_acceso}\n\n` +
      `── DATOS DEL SOLICITANTE ──\n` +
      `Nombre:         ${params.nombre}\n` +
      `Identificación: ${params.identificacion}\n` +
      `Correo:         ${params.correo}\n` +
      `Celular:        ${params.celular}\n\n` +
      `── SOLICITUD ──\n${params.descripcion}\n\n` +
      `─────────────────────────────────────────\n` +
      `EL EQUIPO DE SOPORTE SE CONTACTARÁ PRONTAMENTE CONTIGO.\n` +
      `servicios@amcparqueadero.online`
    );
    window.open(`mailto:servicios@amcparqueadero.online?subject=${subject}&body=${body}`, '_blank');
    return { ok: true, fallback: true };
  }

  // Envío real por Web3Forms
  const res = await fetch(WEB3FORMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      access_key:    WEB3FORMS_ACCESS_KEY,
      subject:       `[${params.ticket_number}] Solicitud de Soporte – ${params.nombre}`,
      from_name:     'My Parking Turn — Soporte',
      botcheck:      '',                       // honeypot anti-spam

      // Campos del formulario que llegan al correo
      'NÚMERO DE RADICADO': params.ticket_number,
      'FECHA Y HORA':        params.fecha,
      'MODO DE ACCESO':      params.modo_acceso,
      'NOMBRE COMPLETO':     params.nombre,
      'IDENTIFICACIÓN':      params.identificacion,
      'CORREO SOLICITANTE':  params.correo,
      'CELULAR':             params.celular,
      'DESCRIPCIÓN / SOLICITUD': params.descripcion,
      'MENSAJE':             'EL EQUIPO DE SOPORTE SE CONTACTARÁ PRONTAMENTE CONTIGO. Para más información: servicios@amcparqueadero.online',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Error al enviar el formulario.');
  }
  return { ok: true, fallback: false };
}

/* ══════════════════════════════════════════
   CONFIRMAR Y ENVIAR
   ══════════════════════════════════════════ */
btnConfirmar.addEventListener('click', async () => {
  const ticketNum   = parseInt(previewModal.dataset.ticketNum, 10);
  const ticketCode  = previewModal.dataset.ticketCode;
  const fechaStr    = previewModal.dataset.fecha;
  const descripcion = previewModal.dataset.descripcion;
  const modoAcceso  = previewModal.dataset.modoAcceso;

  sendStatus.textContent    = '⏳ Enviando solicitud...';
  sendStatus.className      = 'soporte-send-status sending';
  btnConfirmar.disabled     = true;
  btnCerrarPreview.disabled = true;

  try {
    const result = await enviarPorWeb3Forms({
      ticket_number:  ticketCode,
      fecha:          fechaStr,
      modo_acceso:    modoAcceso,
      nombre:         inputNombre.value.trim()    || 'No registrado',
      identificacion: inputDocumento.value.trim() || 'No registrado',
      correo:         inputCorreo.value.trim()    || 'No registrado',
      celular:        inputCelular.value.trim()   || 'No registrado',
      descripcion:    descripcion,
    });

    // Guardar contador de ticket solo si el envío fue exitoso
    saveNextSupportTicketNumber(ticketNum);

    previewModal.hidden          = true;
    document.body.style.overflow = '';

    successTicket.textContent    = ticketCode;
    successModal.hidden          = false;
    document.body.style.overflow = 'hidden';
    btnCerrarExito.focus();

    // Limpiar campos
    inputDescripcion.value = '';
    charCount.textContent  = '0';
    if (GUEST_MODE) {
      inputNombre.value = '';
      inputDocumento.value = '';
      inputCorreo.value = '';
      inputCelular.value = '';
    }

  } catch (err) {
    console.error('[Soporte] Error al enviar:', err);
    sendStatus.textContent = '❌ No se pudo enviar. Intenta de nuevo o escribe directamente a servicios@amcparqueadero.online';
    sendStatus.className   = 'soporte-send-status error';
    btnConfirmar.disabled  = false;
    btnCerrarPreview.disabled = false;
  }
});

/* ══════════════════════════════════════════
   CERRAR MODALES
   ══════════════════════════════════════════ */
function closePreviewModal() {
  previewModal.hidden          = true;
  document.body.style.overflow = '';
  btnConfirmar.disabled        = false;
  btnCerrarPreview.disabled    = false;
  btnEnviar.focus();
}

btnCerrarPreview.addEventListener('click', closePreviewModal);

btnCerrarExito.addEventListener('click', () => {
  successModal.hidden          = true;
  document.body.style.overflow = '';
});

previewModal.addEventListener('click', (e) => {
  if (e.target === previewModal) closePreviewModal();
});

successModal.addEventListener('click', (e) => {
  if (e.target === successModal) {
    successModal.hidden          = true;
    document.body.style.overflow = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!previewModal.hidden) closePreviewModal();
    if (!successModal.hidden) {
      successModal.hidden          = true;
      document.body.style.overflow = '';
    }
  }
});
