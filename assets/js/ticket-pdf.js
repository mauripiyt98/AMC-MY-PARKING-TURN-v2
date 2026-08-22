// ============================================================
// ticket-pdf.js — Comprobantes PDF locales en memoria del navegador
//
// No hace solicitudes HTTP ni escribe en el servidor. El Blob se crea sólo
// mientras el operador descarga el comprobante y se libera enseguida.
// ============================================================
(function attachLocalTicketPdf(global) {
  'use strict';

  const PDF_WIDTH = 288;
  const PDF_HEIGHT = 432;
  const LOGO_WIDTH = 144;
  const LOGO_HEIGHT = 72;
  const LOGO_URL = new URL('../img/LOGOMPT.png', document.currentScript?.src || global.location.href).href;

  function text(value) {
    return String(value ?? 'SIN DATO')
      .replace(/[^\x20-\xFF]/g, '?')
      .replace(/[()\\]/g, '\\$&');
  }

  function asPdfBytes(value) {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xFF;
    return bytes;
  }

  function asBinaryString(bytes) {
    let result = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      result += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return result;
  }

  function loadLogo() {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = LOGO_WIDTH;
        canvas.height = LOGO_HEIGHT;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, LOGO_WIDTH, LOGO_HEIGHT);
        context.drawImage(image, 0, 0, LOGO_WIDTH, LOGO_HEIGHT);
        const bytes = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.92).split(',')[1]), (character) => character.charCodeAt(0));
        resolve(bytes);
      };
      image.onerror = () => reject(new Error('No fue posible cargar el logo del comprobante.'));
      image.src = LOGO_URL;
    });
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP', maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  function ticketDate(record) {
    const source = record.exitIso || record.entryIso || new Date().toISOString();
    const date = new Date(source);
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const value = (type) => parts.find((part) => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }

  function fileName(record) {
    const ticket = String(record.ticketNumber || 0).padStart(6, '0');
    const plate = String(record.plate || 'SINPLACA').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SINPLACA';
    return `Ticket_${ticket}_${plate}_${ticketDate(record)}.pdf`;
  }

  function addText(commands, value, x, y, size, { bold = false, color = '0.10 0.12 0.16' } = {}) {
    commands.push('BT', `${color} rg`, `/${bold ? 'F2' : 'F1'} ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `(${text(value)}) Tj`, 'ET');
  }

  function buildReceiptPdf({ subtitle, details, total, operator, state }, logoBytes) {
    const commands = [
      '0.58 0.06 0.08 rg', `0 ${PDF_HEIGHT - 6} ${PDF_WIDTH} 6 re f`,
      `q ${LOGO_WIDTH} 0 0 ${LOGO_HEIGHT} 72 350 cm /Im1 Do Q`,
      '0.58 0.06 0.08 RG', '24 298 m 264 298 l S',
    ];
    addText(commands, 'MY PARKING TURN', 24, 327, 17, { bold: true, color: '0.58 0.06 0.08' });
    addText(commands, subtitle, 24, 311, 9, { bold: true, color: '0.25 0.27 0.30' });
    addText(commands, 'DETALLE DEL SERVICIO', 24, 280, 8, { bold: true, color: '0.58 0.06 0.08' });
    let cursorY = 263;
    details.forEach((line) => {
      addText(commands, line, 24, cursorY, 8.5);
      cursorY -= 15;
    });
    commands.push('0.98 0.94 0.94 rg', '24 96 240 32 re f', '0.58 0.06 0.08 RG', '24 96 240 32 re S');
    addText(commands, total, 34, 108, 12, { bold: true, color: '0.58 0.06 0.08' });
    addText(commands, `OPERADOR: ${operator || 'SIN DATO'}`, 24, 75, 8, { bold: true });
    addText(commands, `ESTADO: ${state}`, 24, 61, 8, { bold: true, color: '0.25 0.27 0.30' });
    commands.push('0.75 0.77 0.80 RG', '24 48 m 264 48 l S');
    addText(commands, 'Gracias por utilizar nuestro servicio.', 24, 30, 8, { color: '0.35 0.37 0.40' });
    const stream = commands.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 7 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
      `<< /Type /XObject /Subtype /Image /Width ${LOGO_WIDTH} /Height ${LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n${asBinaryString(logoBytes)}\nendstream`,
      `<< /Length ${asPdfBytes(stream).length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(asPdfBytes(pdf).length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = asPdfBytes(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return new Blob([asPdfBytes(pdf)], { type: 'application/pdf' });
  }

  function buildPdf(record, logoBytes) {
    return buildReceiptPdf({
      subtitle: 'COMPROBANTE DE SALIDA',
      details: [
        `TICKET: ${String(record.ticketNumber || 'SIN NUMERO').padStart(6, '0')}`,
        `PLACA: ${record.plate || 'SIN DATO'}`,
        `VEHICULO: ${record.vehicleType || 'SIN DEFINIR'}`,
        `FECHA INGRESO: ${record.date || 'SIN DATO'}`,
        `HORA INGRESO: ${record.entryTime || record.time || 'SIN DATO'}`,
        `HORA SALIDA: ${record.exitTime || 'SIN DATO'}`,
        `TARIFA/HORA: ${formatCurrency(record.hourlyPrice)}`,
        `HORAS COBRADAS: ${record.chargedHours || 'SIN DATO'}`,
      ],
      total: `TOTAL PAGADO: ${formatCurrency(record.totalCharged)}`,
      operator: record.operatorName || record.user,
      state: 'FINALIZADO',
    }, logoBytes);
  }

  async function download(record) {
    const logoBytes = await loadLogo();
    const blob = buildPdf(record, logoBytes);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(record);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return link.download;
  }

  function fileNameMonthly(record) {
    const ticket = String(record.ticketNumber || 0).replace(/[^A-Z0-9-]/gi, '');
    const plate  = String(record.plate || 'SINPLACA').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SINPLACA';
    const date   = ticketDate({ exitIso: record.closedDate ? `${record.closedDate}T00:00:00` : null, entryIso: record.startDate ? `${record.startDate}T00:00:00` : null });
    return `Mensualidad_${ticket}_${plate}_${date}.pdf`;
  }

  function buildMonthlyPdf(record, logoBytes) {
    return buildReceiptPdf({
      subtitle: 'COMPROBANTE DE MENSUALIDAD',
      details: [
        `TICKET: ${String(record.ticketNumber || 'SIN NUMERO')}`,
        `PLACA: ${record.plate || 'SIN DATO'}`,
        `VEHICULO: ${record.vehicleType || 'SIN DEFINIR'}`,
        `FECHA INICIO: ${record.startDate || 'SIN DATO'}`,
        `FECHA CIERRE: ${record.closedDate || record.expiryDate || 'SIN DATO'}`,
        `MOTIVO CIERRE: ${record.closedReason || 'CIERRE MANUAL'}`,
      ],
      total: `TARIFA MENSUAL: ${formatCurrency(record.monthlyRate)}`,
      operator: record.user,
      state: 'FINALIZADO',
    }, logoBytes);
  }

  async function downloadMonthly(record) {
    const logoBytes = await loadLogo();
    const blob      = buildMonthlyPdf(record, logoBytes);
    const url       = URL.createObjectURL(blob);
    const link      = document.createElement('a');
    link.href       = url;
    link.download   = fileNameMonthly(record);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return link.download;
  }

  global.MPTTicketPdf = Object.freeze({ download, fileName, downloadMonthly, fileNameMonthly });
}(window));
