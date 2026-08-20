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
  const LOGO_SIZE = 96;
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
        canvas.width = LOGO_SIZE;
        canvas.height = LOGO_SIZE;
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, LOGO_SIZE, LOGO_SIZE);
        context.drawImage(image, 0, 0, LOGO_SIZE, LOGO_SIZE);
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

  function buildPdf(record, logoBytes) {
    const lines = [
      ['MY PARKING TURN', 16],
      ['COMPROBANTE DE SALIDA', 11],
      ['', 9],
      [`TICKET: ${String(record.ticketNumber || 'SIN NUMERO').padStart(6, '0')}`, 11],
      [`PLACA: ${record.plate || 'SIN DATO'}`, 11],
      [`VEHICULO: ${record.vehicleType || 'SIN DEFINIR'}`, 10],
      [`FECHA INGRESO: ${record.date || 'SIN DATO'}`, 10],
      [`HORA INGRESO: ${record.entryTime || record.time || 'SIN DATO'}`, 10],
      [`HORA SALIDA: ${record.exitTime || 'SIN DATO'}`, 10],
      [`TARIFA/HORA: ${formatCurrency(record.hourlyPrice)}`, 10],
      [`HORAS COBRADAS: ${record.chargedHours || 'SIN DATO'}`, 10],
      ['', 9],
      [`TOTAL PAGADO: ${formatCurrency(record.totalCharged)}`, 13],
      ['', 9],
      [`OPERADOR: ${record.operatorName || record.user || 'SIN DATO'}`, 9],
      ['Estado: FINALIZADO', 9],
      ['', 9],
      ['Gracias por utilizar nuestro servicio.', 9],
    ];
    let cursorY = 286;
    const commands = [
      `q ${LOGO_SIZE} 0 0 ${LOGO_SIZE} 96 310 cm /Im1 Do Q`,
      '36 298 m 252 298 l S',
      'BT', '/F1 10 Tf',
    ];
    lines.forEach(([line, size]) => {
      if (line) commands.push(`/F1 ${size} Tf`, `36 ${cursorY} Td (${text(line)}) Tj`, `-36 -${cursorY} Td`);
      cursorY -= 16;
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Type /XObject /Subtype /Image /Width ${LOGO_SIZE} /Height ${LOGO_SIZE} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n${asBinaryString(logoBytes)}\nendstream`,
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
    const lines = [
      ['MY PARKING TURN', 16],
      ['COMPROBANTE MENSUALIDAD', 11],
      ['', 9],
      [`TICKET: ${String(record.ticketNumber || 'SIN NUMERO')}`, 11],
      [`PLACA: ${record.plate || 'SIN DATO'}`, 11],
      [`VEHICULO: ${record.vehicleType || 'SIN DEFINIR'}`, 10],
      [`FECHA INICIO: ${record.startDate || 'SIN DATO'}`, 10],
      [`FECHA CIERRE: ${record.closedDate || record.expiryDate || 'SIN DATO'}`, 10],
      [`MOTIVO CIERRE: ${record.closedReason || 'CIERRE MANUAL'}`, 10],
      ['', 9],
      [`TARIFA MENSUAL: ${formatCurrency(record.monthlyRate)}`, 13],
      ['', 9],
      [`OPERADOR: ${record.user || 'SIN DATO'}`, 9],
      ['Estado: FINALIZADO', 9],
      ['', 9],
      ['Gracias por utilizar nuestro servicio.', 9],
    ];
    let cursorY = 286;
    const commands = [
      `q ${LOGO_SIZE} 0 0 ${LOGO_SIZE} 96 310 cm /Im1 Do Q`,
      '36 298 m 252 298 l S',
      'BT', '/F1 10 Tf',
    ];
    lines.forEach(([line, size]) => {
      if (line) commands.push(`/F1 ${size} Tf`, `36 ${cursorY} Td (${text(line)}) Tj`, `-36 -${cursorY} Td`);
      cursorY -= 16;
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 5 0 R >> >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Type /XObject /Subtype /Image /Width ${LOGO_SIZE} /Height ${LOGO_SIZE} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n${asBinaryString(logoBytes)}\nendstream`,
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
