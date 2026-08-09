'use strict';

/* ============================================================
   soporte.js — Módulo de Soporte / My Parking Turn v2

   MODO GUEST  (?guest=1 en la URL):
     → Viene del login sin sesión iniciada
     → Los campos de datos del cliente son editables (texto libre)
     → El botón "Volver" regresa al login

   MODO SESIÓN (URL normal, sin ?guest=1):
     → Viene de la pantalla principal con sesión activa
     → Los campos se auto-cargan del perfil y son de solo lectura
     → El botón "Volver" regresa a principal.html

   ENVÍO DE CORREO: EmailJS (emailjs.com)
   ─────────────────────────────────────────────────────────────
   CONFIGURACIÓN RÁPIDA (2 minutos):
   1. Ve a https://www.emailjs.com/ → crea cuenta gratuita
   2. Crea un "Email Service" con tu correo servicios@amcparqueadero.online
   3. Crea un "Email Template" con las variables listadas abajo
   4. Reemplaza los 3 valores de EMAILJS_CONFIG con los tuyos

   VARIABLES DEL TEMPLATE EN EMAILJS:
     {{ticket_number}}    → Número de radicado  (ej. TICKET00042)
     {{fecha}}            → Fecha y hora de la solicitud
     {{nombre}}           → Nombre completo del solicitante
     {{identificacion}}   → Número de identificación
     {{correo}}           → Correo del solicitante
     {{celular}}          → Celular del solicitante
     {{descripcion}}      → Texto de la solicitud
     {{modo_acceso}}      → "Con sesión activa" | "Sin sesión (invitado)"
   ─────────────────────────────────────────────────────────────
   ============================================================ */

const EMAILJS_CONFIG = {
  publicKey:  'TU_PUBLIC_KEY_AQUI',   // Account → API Keys → Public Key
  serviceId:  'TU_SERVICE_ID_AQUI',   // Email Services → Service ID
  templateId: 'TU_TEMPLATE_ID_AQUI', // Email Templates → Template ID
};

/* ══════════════════════════════════════════
   DETECCIÓN DE MODO: GUEST vs. SESIÓN
   ══════════════════════════════════════════ */
const urlParams  = new URLSearchParams(window.location.search);
const IS_GUEST   = urlParams.get('guest') === '1';

/* ── Verificar si hay sesión real activa ── */
function hasActiveSession() {
  try {
    // JWT activo
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
  // Sesión local
  const user    = sessionStorage.getItem('mptUser');
  const token   = sessionStorage.getItem('mptSessionToken');
  const legacy  = sessionStorage.getItem('mptSessionActive');
  return !!(user && token) || legacy === 'true';
}

/* Modo definitivo: si viene con ?guest=1 O no hay sesión → modo invitado */
const GUEST_MODE = IS_GUEST || !hasActiveSession();

/* ── Número de radicado global (no namespaceado por tenant) ── */
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

/* ── Cargar datos del perfil desde storage (solo en modo sesión) ── */
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

/* ── Formatear fecha legible ── */
function formatFecha() {
  return new Date().toLocaleString('es-CO', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

/* ══════════════════════════════════════════
   ELEMENTOS DEL DOM
   ══════════════════════════════════════════ */
const backLink          = document.getElementById('soporteBackLink');
const form              = document.getElementById('soporteForm');
const inputNombre       = document.getElementById('soporteNombre');
const inputDocumento    = document.getElementById('soporteDocumento');
const inputCorreo       = document.getElementById('soporteCorreo');
const inputCelular      = document.getElementById('soporteCelular');
const inputDescripcion  = document.getElementById('soporteDescripcion');
const charCount         = document.getElementById('charCount');
const soporteMessage    = document.getElementById('soporteMessage');
const btnEnviar         = document.getElementById('btnEnviarSolicitud');

// Modal previsualización
const previewModal      = document.getElementById('previewModal');
const pvTicket          = document.getElementById('previewTicketNumber');
const pvFecha           = document.getElementById('previewFecha');
const pvNombre          = document.getElementById('pvNombre');
const pvDocumento       = document.getElementById('pvDocumento');
const pvCorreo          = document.getElementById('pvCorreo');
const pvCelular         = document.getElementById('pvCelular');
const pvDescripcion     = document.getElementById('pvDescripcion');
const sendStatus        = document.getElementById('previewSendStatus');
const btnConfirmar      = document.getElementById('btnConfirmarEnvio');
const btnCerrarPreview  = document.getElementById('btnCerrarPreview');

// Modal éxito
const successModal      = document.getElementById('successModal');
const successTicket     = document.getElementById('successTicketDisplay');
const btnCerrarExito    = document.getElementById('btnCerrarExito');

// Badge de modo en el panel
const panelHeadingP     = document.querySelector('.soporte-panel-heading p');

/* ══════════════════════════════════════════
   INICIALIZACIÓN
   ══════════════════════════════════════════ */
(function init() {
  /* ── EmailJS ── */
  if (typeof emailjs !== 'undefined') {
    emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
  }

  /* ── Configurar botón Volver ── */
  if (GUEST_MODE) {
    backLink.href        = '../../index.html';
    backLink.textContent = '';
    // Restaurar ícono SVG
    backLink.innerHTML   =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="15 18 9 12 15 6"/></svg> VOLVER AL LOGIN';
  } else {
    backLink.href        = '../principal.html';
    backLink.innerHTML   =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="15 18 9 12 15 6"/></svg> VOLVER A TURNOS';
  }

  /* ── Modo GUEST: campos editables ── */
  if (GUEST_MODE) {
    // Habilitar edición manual en los 4 campos
    [inputNombre, inputDocumento, inputCorreo, inputCelular].forEach((el) => {
      el.removeAttribute('readonly');
      el.required = true;
    });

    // Placeholder descriptivos
    inputNombre.placeholder    = 'Ej.: Juan Pérez';
    inputDocumento.placeholder = 'Ej.: 1234567890';
    inputCorreo.placeholder    = 'tu@correo.com';
    inputCelular.placeholder   = 'Ej.: 3001234567';

    // Ajustar descripción del panel
    if (panelHeadingP) {
      panelHeadingP.innerHTML =
        '<span class="soporte-guest-badge">👤 MODO INVITADO</span> ' +
        'Completa manualmente tus datos para que el equipo de soporte pueda contactarte.';
    }

  } else {
    /* ── Modo SESIÓN: auto-cargar perfil, campos solo lectura ── */
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
   VALIDACIÓN EN MODO GUEST (correo y celular)
   ══════════════════════════════════════════ */
function validateGuestFields() {
  const nombre     = inputNombre.value.trim();
  const documento  = inputDocumento.value.trim();
  const correo     = inputCorreo.value.trim();
  const celular    = inputCelular.value.trim();

  if (!nombre) {
    showMsg('Por favor ingresa tu nombre completo.');
    inputNombre.focus();
    return false;
  }
  if (!documento) {
    showMsg('Por favor ingresa tu número de identificación.');
    inputDocumento.focus();
    return false;
  }
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    showMsg('Ingresa un correo electrónico válido.');
    inputCorreo.focus();
    return false;
  }
  if (!celular) {
    showMsg('Por favor ingresa tu número de celular.');
    inputCelular.focus();
    return false;
  }
  return true;
}

function showMsg(text, type = 'error') {
  soporteMessage.textContent = text;
  soporteMessage.className   = 'soporte-message' + (type === 'success' ? ' is-success' : '');
}

/* ══════════════════════════════════════════
   SUBMIT → abrir previsualización
   ══════════════════════════════════════════ */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  showMsg('');

  // En modo guest validar campos manuales
  if (GUEST_MODE && !validateGuestFields()) return;

  const descripcion = inputDescripcion.value.trim();
  if (!descripcion) {
    showMsg('Por favor describe tu solicitud antes de continuar.');
    inputDescripcion.focus();
    return;
  }
  if (descripcion.length < 10) {
    showMsg('La descripción es muy corta. Agrega más detalles.');
    inputDescripcion.focus();
    return;
  }

  const ticketNum  = getNextSupportTicketNumber();
  const ticketCode = formatTicketNumber(ticketNum);
  const fechaStr   = formatFecha();
  const modoAcceso = GUEST_MODE ? 'Sin sesión (invitado)' : 'Con sesión activa';

  // Llenar previsualización
  pvTicket.textContent      = ticketCode;
  pvFecha.textContent       = fechaStr;
  pvNombre.textContent      = inputNombre.value.trim()    || '—';
  pvDocumento.textContent   = inputDocumento.value.trim() || '—';
  pvCorreo.textContent      = inputCorreo.value.trim()    || '—';
  pvCelular.textContent     = inputCelular.value.trim()   || '—';
  pvDescripcion.textContent = descripcion;
  sendStatus.textContent    = '';
  sendStatus.className      = 'soporte-send-status';

  // Guardar datos pendientes
  previewModal.dataset.ticketNum   = ticketNum;
  previewModal.dataset.ticketCode  = ticketCode;
  previewModal.dataset.fecha       = fechaStr;
  previewModal.dataset.descripcion = descripcion;
  previewModal.dataset.modoAcceso  = modoAcceso;

  previewModal.hidden          = false;
  document.body.style.overflow = 'hidden';
  btnConfirmar.focus();
});

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

  const templateParams = {
    ticket_number:  ticketCode,
    fecha:          fechaStr,
    nombre:         inputNombre.value.trim()    || 'No registrado',
    identificacion: inputDocumento.value.trim() || 'No registrado',
    correo:         inputCorreo.value.trim()    || 'No registrado',
    celular:        inputCelular.value.trim()   || 'No registrado',
    descripcion:    descripcion,
    modo_acceso:    modoAcceso,
  };

  try {
    if (
      typeof emailjs !== 'undefined' &&
      EMAILJS_CONFIG.publicKey  !== 'TU_PUBLIC_KEY_AQUI' &&
      EMAILJS_CONFIG.serviceId  !== 'TU_SERVICE_ID_AQUI' &&
      EMAILJS_CONFIG.templateId !== 'TU_TEMPLATE_ID_AQUI'
    ) {
      await emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateId,
        templateParams
      );
    } else {
      /* MODO DEMO: abrir cliente de correo como respaldo */
      const subject = encodeURIComponent(
        `[${ticketCode}] Solicitud de Soporte – ${templateParams.nombre}`
      );
      const body = encodeURIComponent(
        `NÚMERO DE RADICADO: ${ticketCode}\n` +
        `FECHA: ${fechaStr}\n` +
        `MODO DE ACCESO: ${modoAcceso}\n\n` +
        `── DATOS DEL SOLICITANTE ──\n` +
        `Nombre:         ${templateParams.nombre}\n` +
        `Identificación: ${templateParams.identificacion}\n` +
        `Correo:         ${templateParams.correo}\n` +
        `Celular:        ${templateParams.celular}\n\n` +
        `── SOLICITUD ──\n${descripcion}\n\n` +
        `──────────────────────────────\n` +
        `EL EQUIPO DE SOPORTE SE CONTACTARÁ PRONTAMENTE CONTIGO.\n` +
        `servicios@amcparqueadero.online`
      );
      window.open(
        `mailto:servicios@amcparqueadero.online?subject=${subject}&body=${body}`,
        '_blank'
      );
    }

    saveNextSupportTicketNumber(ticketNum);

    previewModal.hidden          = true;
    document.body.style.overflow = '';

    successTicket.textContent    = ticketCode;
    successModal.hidden          = false;
    document.body.style.overflow = 'hidden';
    btnCerrarExito.focus();

    // Limpiar formulario
    inputDescripcion.value = '';
    charCount.textContent  = '0';
    if (GUEST_MODE) {
      inputNombre.value    = '';
      inputDocumento.value = '';
      inputCorreo.value    = '';
      inputCelular.value   = '';
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
