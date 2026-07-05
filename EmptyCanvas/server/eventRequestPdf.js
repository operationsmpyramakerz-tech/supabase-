const PDFDocument = require('pdfkit');
const path = require('path');
const { attachPageNumbers } = require('./pdfPageNumbers');
const { drawStocktakingHeader } = require('./pdfHeader');
const { enableArabicPdf, ensurePdfArabicSupport } = require('./pdfArabicSupport');

function text(value, fallback = '—') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function asDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function formatDate(value) {
  const date = asDate(value);
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDateRange(event = {}) {
  const start = asDate(event.eventStartDate);
  const end = asDate(event.eventEndDate);
  if (!start) return 'Date to be confirmed';
  const startText = formatDate(start);
  if (!end || end.getTime() === start.getTime()) return startText;
  const sameDay = start.toDateString() === end.toDateString();
  const endText = end.toLocaleString('en-GB', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${startText} - ${endText}`;
}

function money(value) {
  const number = Number(value || 0);
  return `EGP ${Number.isFinite(number) ? Math.max(0, number).toFixed(2) : '0.00'}`;
}

function eventTypeLabel(event = {}) {
  if (String(event.eventTypeCustom || '').trim()) return String(event.eventTypeCustom).trim();
  const labels = {
    tech_day: 'Tech Day', seminar: 'Seminar', steam_fair: 'STEAM Fair',
    competition: 'Competition', exhibition: 'Exhibition', other: 'Other',
  };
  const key = String(event.eventType || 'other').trim().toLowerCase();
  return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (part) => part.toUpperCase());
}

function statusLabel(value) {
  const key = String(value || 'submitted').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'in_progress') return 'In progress';
  if (key === 'completed') return 'Completed';
  if (key === 'cancelled') return 'Cancelled';
  return 'Submitted';
}

async function pipeEventRequestPDF(event = {}, stream) {
  await ensurePdfArabicSupport();
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true });
  enableArabicPdf(doc);
  doc.pipe(stream);
  attachPageNumbers(doc);

  const COLORS = {
    text: '#111827', muted: '#6B7280', border: '#E5E7EB', soft: '#F9FAFB', soft2: '#F3F4F6',
    softOrange: '#FFF7ED', orange: '#EA580C', orangeBorder: '#F97316', dark: '#111827', violet: '#6D28D9',
  };
  const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.png');
  const metrics = () => ({
    pageW: doc.page.width,
    pageH: doc.page.height,
    mL: doc.page.margins.left,
    mR: doc.page.margins.right,
    mB: doc.page.margins.bottom,
    contentW: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    maxY: doc.page.height - doc.page.margins.bottom - 18,
  });
  const drawHeader = (compact = false) => {
    drawStocktakingHeader(doc, { title: 'Event Request Report', variant: compact ? 'compact' : 'default', logoPath, colors: COLORS });
  };
  const ensureSpace = (height = 28) => {
    if (doc.y + height <= metrics().maxY) return;
    doc.addPage();
    drawHeader(true);
  };
  const drawTitle = (title) => {
    ensureSpace(28);
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(13).text(text(title), metrics().mL, doc.y, { width: metrics().contentW });
    doc.moveDown(0.35);
  };
  const heightFor = (value, width, size = 8.8) => {
    doc.font('Helvetica').fontSize(size);
    return doc.heightOfString(text(value), { width, lineGap: 1 });
  };
  const drawMetaCard = (x, y, width, label, value) => {
    const val = text(value);
    const h = Math.max(54, heightFor(val, width - 22, 10) + 36);
    doc.save();
    doc.roundedRect(x, y, width, h, 13).fillAndStroke('#FFFFFF', COLORS.border);
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8.4).text(label, x + 11, y + 10, { width: width - 22 });
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10).text(val, x + 11, y + 27, { width: width - 22, lineGap: 1 });
    doc.restore();
    return h;
  };
  const drawMetaRow = (items, columns = 3) => {
    const { mL, contentW } = metrics();
    const gap = 10;
    const colW = (contentW - gap * (columns - 1)) / columns;
    const y = doc.y;
    const heights = items.map((item, index) => drawMetaCard(mL + index * (colW + gap), y, colW, item.label, item.value));
    doc.y = y + Math.max(...heights) + 14;
  };
  const drawSimpleField = (x, y, width, label, value) => {
    const val = text(value);
    const h = Math.max(49, heightFor(val, width - 18, 8.8) + 34);
    doc.save();
    doc.roundedRect(x, y, width, h, 9).fillAndStroke(COLORS.soft, COLORS.border);
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(7.8).text(label, x + 9, y + 9, { width: width - 18 });
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(8.7).text(val, x + 9, y + 24, { width: width - 18, lineGap: 1 });
    doc.restore();
    return h;
  };
  const drawDetailsCard = () => {
    const { mL, contentW } = metrics();
    const gap = 9;
    const cellW = (contentW - 24 - gap) / 2;
    const fields = [
      ['Event type', eventTypeLabel(event)], ['Status', statusLabel(event.status)],
      ['Organization', event.organizationName], ['Expected attendees', event.expectedAttendees || '—'],
      ['Contact person', event.contactPerson], ['Contact phone', event.contactPhone],
      ['Contact email', event.contactEmail], ['Governorate', event.governorate],
      ['Venue', event.venueName], ['Venue type', event.venueType],
    ];
    const rows = [];
    for (let index = 0; index < fields.length; index += 2) rows.push(fields.slice(index, index + 2));
    const estimateH = 42 + rows.reduce((sum, row) => {
      const a = Math.max(49, heightFor(row[0]?.[1], cellW - 18, 8.8) + 34);
      const b = Math.max(49, heightFor(row[1]?.[1], cellW - 18, 8.8) + 34);
      return sum + Math.max(a, b) + gap;
    }, 0) + 8;
    ensureSpace(estimateH + 10);
    const y = doc.y;
    doc.save();
    doc.roundedRect(mL, y, contentW, estimateH, 15).fillAndStroke('#FFFFFF', COLORS.orangeBorder);
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(11.5).text('Event Details', mL + 12, y + 12, { width: contentW - 24 });
    doc.restore();
    let currentY = y + 35;
    rows.forEach((row) => {
      const leftH = drawSimpleField(mL + 12, currentY, cellW, row[0]?.[0] || '', row[0]?.[1] || '—');
      const rightH = drawSimpleField(mL + 12 + cellW + gap, currentY, cellW, row[1]?.[0] || '', row[1]?.[1] || '—');
      currentY += Math.max(leftH, rightH) + gap;
    });
    doc.y = y + estimateH + 11;
  };
  const normalizeRows = (items, type) => (Array.isArray(items) ? items : []).map((item) => {
    const quantity = Number(item?.quantity || 0) || 0;
    const unit = Number(item?.unitCost ?? item?.workingCost ?? 0) || 0;
    const total = Number(item?.totalCost ?? (unit * quantity) ?? 0) || 0;
    return {
      name: text(type === 'project' ? (item?.title || item?.name) : item?.name, 'Untitled item'),
      quantity,
      unit,
      total,
      notes: text(type === 'project' ? (item?.description || item?.notes) : item?.notes, ''),
    };
  });
  const measureTable = (rows) => {
    const { contentW } = metrics();
    const tableW = contentW - 24;
    const cols = { name: Math.max(176, tableW - 215), qty: 42, unit: 72, total: 76 };
    const safeRows = rows.length ? rows : [{ name: 'No items were added.', empty: true }];
    const headerH = 22;
    const bodyH = safeRows.reduce((sum, row) => sum + Math.max(24, heightFor(row.name, row.empty ? tableW - 18 : cols.name, 8.4) + (row.notes ? heightFor(row.notes, row.empty ? tableW - 18 : cols.name, 7.5) + 15 : 12)), 0);
    return headerH + bodyH + 24;
  };
  const drawItemsTable = (x, y, width, rows) => {
    const cols = { name: Math.max(176, width - 215), qty: 42, unit: 72, total: 76 };
    const safeRows = rows.length ? rows : [{ name: 'No items were added.', empty: true }];
    const headerH = 22;
    const tableH = measureTable(rows);
    const totalCost = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    doc.save();
    doc.roundedRect(x, y, width, tableH, 10).fillAndStroke('#FFFFFF', COLORS.border);
    doc.rect(x, y, width, headerH).fill(COLORS.soft2);
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8.3);
    doc.text('Item', x + 9, y + 7, { width: cols.name });
    doc.text('Qty', x + width - cols.qty - cols.unit - cols.total - 17, y + 7, { width: cols.qty, align: 'right' });
    doc.text('Unit Cost', x + width - cols.unit - cols.total - 11, y + 7, { width: cols.unit, align: 'right' });
    doc.text('Total Cost', x + width - cols.total - 8, y + 7, { width: cols.total, align: 'right' });
    let rowY = y + headerH;
    safeRows.forEach((row, index) => {
      const isEmpty = !!row.empty;
      const rowH = Math.max(24, heightFor(row.name, isEmpty ? width - 18 : cols.name, 8.4) + (row.notes ? heightFor(row.notes, isEmpty ? width - 18 : cols.name, 7.5) + 15 : 12));
      if (index > 0) doc.moveTo(x, rowY).lineTo(x + width, rowY).strokeColor(COLORS.border).stroke();
      if (isEmpty) {
        doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8.5).text(row.name, x + 9, rowY + 8, { width: width - 18, align: 'center' });
      } else {
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8.5).text(row.name, x + 9, rowY + 7, { width: cols.name });
        if (row.notes) doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5).text(row.notes, x + 9, rowY + 19, { width: cols.name, lineGap: 1 });
        doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8.5).text(String(row.quantity || 0), x + width - cols.qty - cols.unit - cols.total - 17, rowY + 7, { width: cols.qty, align: 'right' });
        doc.text(money(row.unit), x + width - cols.unit - cols.total - 11, rowY + 7, { width: cols.unit, align: 'right' });
        doc.text(money(row.total), x + width - cols.total - 8, rowY + 7, { width: cols.total, align: 'right' });
      }
      rowY += rowH;
    });
    doc.moveTo(x, rowY).lineTo(x + width, rowY).strokeColor(COLORS.border).stroke();
    doc.rect(x, rowY, width, 24).fill(COLORS.softOrange);
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8.8).text('Total Cost', x + 9, rowY + 7, { width: width - cols.total - 18 });
    doc.text(money(totalCost), x + width - cols.total - 8, rowY + 7, { width: cols.total, align: 'right' });
    doc.restore();
    return tableH;
  };
  const drawSectionCard = (title, rows) => {
    const { mL, contentW } = metrics();
    const rowsH = measureTable(rows);
    const cardH = 46 + rowsH + 14;
    ensureSpace(cardH + 10);
    const y = doc.y;
    doc.save();
    doc.roundedRect(mL, y, contentW, cardH, 15).fillAndStroke('#FFFFFF', COLORS.orangeBorder);
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(11.5).text(title, mL + 12, y + 12, { width: contentW - 24 });
    doc.restore();
    drawItemsTable(mL + 12, y + 34, contentW - 24, rows);
    doc.y = y + cardH + 11;
  };
  const drawCostSummary = () => {
    drawTitle('Cost Summary');
    drawMetaRow([
      { label: 'Working Cost', value: money(event.workingCost) },
      { label: 'Transport Cost', value: money(event.transportCost) },
      { label: 'Total Cost', value: money(event.totalCost) },
    ]);
  };
  const drawLocationNotes = () => {
    drawTitle('Venue & Location Notes');
    const { mL, contentW } = metrics();
    const noteRows = [
      ['Event Dates', formatDateRange(event)],
      ['Venue Setup Time', formatDate(event.venueSetupTime)],
      ['Google Maps / Location URL', event.locationUrl || '—'],
      ['Utilities', [event.requiresPower && 'Power points', event.requiresInternet && 'Internet', event.requiresSoundSystem && 'Sound system'].filter(Boolean).join(' • ') || 'No special utilities selected'],
      ['Venue Notes', event.venueNotes || 'No venue notes were added.'],
    ];
    const gap = 9;
    const cellW = (contentW - gap) / 2;
    for (let index = 0; index < noteRows.length; index += 2) {
      const pair = noteRows.slice(index, index + 2);
      const h = Math.max(
        Math.max(49, heightFor(pair[0]?.[1], cellW - 18, 8.8) + 34),
        Math.max(49, heightFor(pair[1]?.[1], cellW - 18, 8.8) + 34),
      );
      ensureSpace(h + 10);
      const y = doc.y;
      drawSimpleField(mL, y, cellW, pair[0]?.[0] || '', pair[0]?.[1] || '—');
      if (pair[1]) drawSimpleField(mL + cellW + gap, y, cellW, pair[1][0], pair[1][1]);
      doc.y = y + h + gap;
    }
  };

  drawHeader(false);
  drawTitle('Request Data');
  drawMetaRow([
    { label: 'Event Name', value: event.eventName },
    { label: 'Event ID', value: event.eventCode },
    { label: 'Submitted By', value: event.requesterName },
  ]);
  drawDetailsCard();
  drawTitle('Event Requirements');
  drawSectionCard('Projects / Activities', normalizeRows(event.projects, 'project'));
  drawSectionCard('Marketing Materials', normalizeRows(event.marketingMaterials, 'component'));
  drawSectionCard('Venue Requirements', normalizeRows(event.venueRequirements, 'component'));
  drawCostSummary();
  drawLocationNotes();

  return await new Promise((resolve, reject) => {
    const done = () => resolve();
    stream.once('finish', done);
    stream.once('close', done);
    stream.once('error', reject);
    doc.once('error', reject);
    doc.end();
  });
}

module.exports = { pipeEventRequestPDF };
