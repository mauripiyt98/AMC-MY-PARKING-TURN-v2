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

  function buildPdf(record) {
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
    let cursorY = 395;
    const commands = ['36 405 m 252 405 l S', 'BT', '/F1 10 Tf'];
    lines.forEach(([line, size]) => {
      if (line) commands.push(`/F1 ${size} Tf`, `36 ${cursorY} Td (${text(line)}) Tj`, `-36 -${cursorY} Td`);
      cursorY -= 19;
    });
    commands.push('ET');
    const stream = commands.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
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

  function download(record) {
    const blob = buildPdf(record);
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

  global.MPTTicketPdf = Object.freeze({ download, fileName });
}(window));
