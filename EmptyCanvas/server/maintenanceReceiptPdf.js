const PDFDocument = require("pdfkit");
const path = require("path");
const { attachPageNumbers } = require("./pdfPageNumbers");
const { drawStocktakingHeader } = require("./pdfHeader");
const { enableArabicPdf, ensurePdfArabicSupport } = require("./pdfArabicSupport");

function formatDateTime(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return String(date || "-");
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(date || "-");
  }
}

function ensureText(value, fallback = "—") {
  const text = String(value || "").trim();
  return text || fallback;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2)}`;
}

function uniqueTextList(value) {
  const out = [];
  const seen = new Set();
  const push = (entry) => {
    String(entry || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const key = part.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(part);
      });
  };
  if (Array.isArray(value)) value.forEach(push);
  else push(value);
  return out;
}

function normalizeSpareParts(item = {}) {
  const provided = Array.isArray(item.spareParts) ? item.spareParts : [];
  if (provided.length) {
    const seen = new Set();
    return provided
      .map((part) => {
        const name = ensureText(part?.name || part?.component || part?.label, "Spare part");
        const idCode = ensureText(part?.idCode || part?.displayId, "");
        const unit = Number.isFinite(Number(part?.unit ?? part?.unitPrice)) ? Number(part?.unit ?? part?.unitPrice) : 0;
        const qty = Number.isFinite(Number(part?.qty ?? part?.quantity)) ? Number(part?.qty ?? part?.quantity) : 1;
        const total = Number.isFinite(Number(part?.total)) ? Number(part.total) : unit * qty;
        return { name, idCode, unit, qty, total };
      })
      .filter((part) => {
        const key = `${part.idCode}|${part.name}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  return uniqueTextList(
    item?.sparePartsReplacedNames?.length
      ? item.sparePartsReplacedNames
      : (item?.sparePartsReplacedName || item?.sparePartsReplaced || []),
  ).map((name) => ({ name, idCode: "", unit: 0, qty: 1, total: 0 }));
}

function buildComponentLogs(params = {}) {
  const provided = Array.isArray(params.componentLogs) ? params.componentLogs : [];
  if (provided.length) {
    return provided.map((item) => ({
      idCode: ensureText(item?.idCode, ""),
      component: ensureText(item?.component, "Unknown Component"),
      issueDescription: ensureText(item?.issueDescription || item?.issue, "No Issue"),
      actualIssueDescription: ensureText(item?.actualIssueDescription),
      repairAction: ensureText(item?.repairAction),
      resolutionMethod: ensureText(item?.resolutionMethod),
      spareParts: normalizeSpareParts(item),
    }));
  }

  const rows = Array.isArray(params.rows) && params.rows.length ? params.rows : [{ component: "Maintenance order" }];
  return rows.map((row) => ({
    idCode: ensureText(row?.idCode, ""),
    component: ensureText(row?.component, "Unknown Component"),
    issueDescription: ensureText(params.issueDescription || row?.issue || row?.reason, "No Issue"),
    actualIssueDescription: ensureText(params.actualIssueDescription),
    repairAction: ensureText(params.repairAction),
    resolutionMethod: ensureText(params.resolutionMethod),
    spareParts: uniqueTextList(params.sparePartsReplacedList || params.sparePartsReplaced || [])
      .map((name) => ({ name, idCode: "", unit: 0, qty: 1, total: 0 })),
  }));
}

async function pipeMaintenanceReceiptPDF(params = {}, stream) {
  await ensurePdfArabicSupport();
  const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
  enableArabicPdf(doc);
  doc.pipe(stream);
  attachPageNumbers(doc);

  const COLORS = {
    text: "#111827",
    muted: "#6B7280",
    border: "#E5E7EB",
    cardBorder: "#F97316",
    soft: "#F9FAFB",
    soft2: "#F3F4F6",
    softOrange: "#FFF7ED",
    dark: "#111827",
    accent: "#EA580C",
  };

  const logoPath = path.join(__dirname, "..", "public", "images", "logo.png");
  const SIGNATURE_FOOTER_H = 84;

  const metrics = () => {
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const mL = doc.page.margins.left;
    const mR = doc.page.margins.right;
    const mB = doc.page.margins.bottom;
    return {
      pageW,
      pageH,
      mL,
      mR,
      mB,
      contentW: pageW - mL - mR,
      maxY: pageH - mB - SIGNATURE_FOOTER_H,
    };
  };

  const drawHeader = (compact = false) => {
    drawStocktakingHeader(doc, {
      title: "Maintenance Report",
      subtitle: `Order: ${ensureText(params.orderId)}  •  Generated: ${formatDateTime(new Date())}`,
      variant: compact ? "compact" : "default",
      logoPath,
      colors: COLORS,
    });
  };

  const ensureSpace = (height = 24) => {
    if (doc.y + height <= metrics().maxY) return;
    doc.addPage();
    drawHeader(true);
  };

  const drawSectionTitle = (title) => {
    ensureSpace(30);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(13).text(String(title || "").trim(), metrics().mL, doc.y, {
      width: metrics().contentW,
    });
    doc.moveDown(0.35);
  };

  const drawMetaCard = (x, y, w, label, value) => {
    const text = ensureText(value);
    doc.font("Helvetica").fontSize(10);
    const h = Math.max(52, doc.heightOfString(text, { width: w - 22 }) + 34);
    doc.save();
    doc.roundedRect(x, y, w, h, 13).fillAndStroke("#FFFFFF", COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.5).text(label, x + 11, y + 10, { width: w - 22 });
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10.5).text(text, x + 11, y + 27, {
      width: w - 22,
      lineGap: 1,
    });
    doc.restore();
    return h;
  };

  const drawOrderData = () => {
    drawSectionTitle("Order Data");
    const { mL, contentW } = metrics();
    const gap = 10;
    const colW = (contentW - gap * 2) / 3;
    const y = doc.y;
    const heights = [
      drawMetaCard(mL, y, colW, "Team Member", params.teamMember || params.requestedBy),
      drawMetaCard(mL + colW + gap, y, colW, "Order ID", params.orderId),
      drawMetaCard(mL + (colW + gap) * 2, y, colW, "Date", formatDateTime(params.createdAt)),
    ];
    doc.y = y + Math.max(...heights) + 14;
  };

  const textHeight = (value, width, fontSize = 8.8) => {
    doc.font("Helvetica").fontSize(fontSize);
    return doc.heightOfString(ensureText(value), { width, lineGap: 1 });
  };

  const measureSmallField = (w, value) => {
    const valueH = textHeight(value, w - 18, 8.8);
    return Math.max(46, 10 + 10 + 4 + valueH + 10);
  };

  const drawSmallField = (x, y, w, label, value) => {
    const h = measureSmallField(w, value);
    const valueText = ensureText(value);
    doc.save();
    doc.roundedRect(x, y, w, h, 9).fillAndStroke(COLORS.soft, COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(label, x + 9, y + 9, { width: w - 18 });
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.8).text(valueText, x + 9, y + 24, {
      width: w - 18,
      lineGap: 1,
    });
    doc.restore();
    return h;
  };

  const measureSparePartsTable = (w, parts = []) => {
    const safeParts = Array.isArray(parts) ? parts : [];
    const rows = safeParts.length ? safeParts : [{ name: "No spare parts replaced", idCode: "", unit: 0, qty: 1, total: 0 }];
    const headerH = 22;
    const totalH = 24;
    let bodyH = 0;
    rows.forEach((part) => {
      const nameW = Math.max(140, w - 220);
      bodyH += Math.max(23, textHeight(part.name, nameW, 8.4) + 13);
    });
    return headerH + bodyH + totalH;
  };

  const drawSparePartsTable = (x, y, w, parts = []) => {
    const safeParts = Array.isArray(parts) ? parts : [];
    const rows = safeParts.length ? safeParts : [{ name: "No spare parts replaced", idCode: "", unit: 0, qty: 1, total: 0 }];
    const headerH = 22;
    const tableH = measureSparePartsTable(w, parts);
    const totalCost = safeParts.reduce((sum, part) => sum + (Number(part.total) || 0), 0);

    const numW = 28;
    const qtyW = 42;
    const unitW = 64;
    const totalW = 72;
    const nameW = Math.max(110, w - numW - qtyW - unitW - totalW - 34);

    doc.save();
    doc.roundedRect(x, y, w, tableH, 10).fillAndStroke("#FFFFFF", COLORS.border);
    doc.rect(x, y, w, headerH).fill(COLORS.soft2);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.4);
    doc.text("#", x + 9, y + 7, { width: numW });
    doc.text("Spare Parts Replacement", x + 9 + numW, y + 7, { width: nameW });
    doc.text("Qty", x + 9 + numW + nameW + 4, y + 7, { width: qtyW, align: "right" });
    doc.text("Unit Cost", x + w - unitW - totalW - 14, y + 7, { width: unitW, align: "right" });
    doc.text("Total Cost", x + w - totalW - 10, y + 7, { width: totalW, align: "right" });
    doc.strokeColor(COLORS.border).lineWidth(0.8).moveTo(x, y + headerH).lineTo(x + w, y + headerH).stroke();

    let rowY = y + headerH;
    rows.forEach((part, idx) => {
      const nameText = ensureText(part.name, "Spare part");
      const rowH = Math.max(23, textHeight(nameText, nameW, 8.4) + 13);
      if (idx > 0) doc.moveTo(x, rowY).lineTo(x + w, rowY).strokeColor(COLORS.border).stroke();
      doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.4).text(safeParts.length ? String(idx + 1) : "—", x + 9, rowY + 7, { width: numW });
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.4).text(nameText, x + 9 + numW, rowY + 7, { width: nameW, lineGap: 1 });
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.4).text(safeParts.length ? String(Number(part.qty) || 1) : "—", x + 9 + numW + nameW + 4, rowY + 7, { width: qtyW, align: "right" });
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.4).text(safeParts.length ? money(part.unit) : "—", x + w - unitW - totalW - 14, rowY + 7, { width: unitW, align: "right" });
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.4).text(safeParts.length ? money(part.total) : "—", x + w - totalW - 10, rowY + 7, { width: totalW, align: "right" });
      rowY += rowH;
    });

    doc.moveTo(x, rowY).lineTo(x + w, rowY).strokeColor(COLORS.border).stroke();
    doc.rect(x, rowY, w, 24).fill(COLORS.softOrange);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9).text("Total Cost", x + 9, rowY + 7, { width: w - totalW - 24 });
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9).text(money(totalCost), x + w - totalW - 10, rowY + 7, { width: totalW, align: "right" });
    doc.restore();
    return tableH;
  };

  const measureMaintenanceCard = (item) => {
    const { contentW } = metrics();
    const fieldsGap = 8;
    const fieldW = (contentW - 24 - fieldsGap) / 2;
    const issueH = Math.max(
      measureSmallField(fieldW, item.issueDescription),
      measureSmallField(fieldW, item.resolutionMethod),
    );
    const actionH = Math.max(
      measureSmallField(fieldW, item.actualIssueDescription),
      measureSmallField(fieldW, item.repairAction),
    );
    const tableH = measureSparePartsTable(contentW - 24, item.spareParts || []);
    return 54 + issueH + fieldsGap + actionH + 10 + tableH + 16;
  };

  const drawMaintenanceCard = (item, index) => {
    const { mL, contentW } = metrics();
    const fieldsGap = 8;
    const fieldW = (contentW - 24 - fieldsGap) / 2;
    const spareParts = Array.isArray(item.spareParts) ? item.spareParts : [];
    const cardH = measureMaintenanceCard(item);

    // Do not push the whole component to the next page just because the full
    // calculated card is tall. Starting the next component as soon as there is
    // enough visible space avoids the large blank gaps seen in generated reports.
    ensureSpace(Math.min(cardH + 10, 220));
    const y = doc.y;
    doc.save();
    doc.roundedRect(mL, y, contentW, cardH, 15).fillAndStroke("#FFFFFF", COLORS.cardBorder);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11.5).text(`Maintenance for Component ${index + 1}`, mL + 12, y + 12, {
      width: contentW - 24,
    });
    const subtitle = [item.idCode ? `ID: ${item.idCode}` : "", item.component].filter(Boolean).join("  •  ");
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9.2).text(subtitle || "Unknown Component", mL + 12, y + 30, {
      width: contentW - 24,
    });
    doc.restore();

    let fy = y + 52;
    const issueH = Math.max(
      drawSmallField(mL + 12, fy, fieldW, "Initial Issue", item.issueDescription),
      drawSmallField(mL + 12 + fieldW + fieldsGap, fy, fieldW, "Resolution Method", item.resolutionMethod),
    );
    fy += issueH + fieldsGap;
    const actionH = Math.max(
      drawSmallField(mL + 12, fy, fieldW, "Actual Issue Description", item.actualIssueDescription),
      drawSmallField(mL + 12 + fieldW + fieldsGap, fy, fieldW, "Repair Action", item.repairAction),
    );
    fy += actionH + 10;
    drawSparePartsTable(mL + 12, fy, contentW - 24, spareParts);

    doc.y = y + cardH + 10;
  };

  const drawFooterSignatureBox = (x, y, w, title) => {
    const h = 62;
    doc.save();
    doc.roundedRect(x, y, w, h, 10).fillAndStroke("#FFFFFF", COLORS.border);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.6).text(title, x + 10, y + 8, { width: w - 20 });
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.2).text("Name", x + 10, y + 27, { width: 44 });
    doc.strokeColor(COLORS.border).lineWidth(0.9).moveTo(x + 54, y + 35).lineTo(x + w - 10, y + 35).stroke();
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(8.2).text("Signature", x + 10, y + 45, { width: 58 });
    doc.strokeColor(COLORS.border).lineWidth(0.9).moveTo(x + 70, y + 53).lineTo(x + w - 10, y + 53).stroke();
    doc.restore();
    return h;
  };

  const drawSignatureFooters = () => {
    if (typeof doc.bufferedPageRange !== "function" || typeof doc.switchToPage !== "function") return;
    const range = doc.bufferedPageRange();
    const total = Number(range?.count) || 0;
    const start = Number(range?.start) || 0;
    if (!total) return;

    for (let i = start; i < start + total; i += 1) {
      try {
        doc.switchToPage(i);
        const { mL, contentW, pageH, mB } = metrics();
        const y = pageH - mB - 72;
        const gap = 14;
        const w = (contentW - gap) / 2;
        doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10).text("Signatures", mL, y - 16, { width: contentW });
        drawFooterSignatureBox(mL, y, w, "Technician Signature");
        drawFooterSignatureBox(mL + w + gap, y, w, "Machine Owner Signature");
      } catch {}
    }
  };

  drawHeader(false);
  drawOrderData();

  const componentLogs = buildComponentLogs(params);
  drawSectionTitle("Maintenance Details");
  componentLogs.forEach((item, index) => drawMaintenanceCard(item, index));
  drawSignatureFooters();

  return await new Promise((resolve, reject) => {
    const done = () => resolve();
    const fail = (err) => reject(err);
    stream.once("finish", done);
    stream.once("close", done);
    stream.once("error", fail);
    doc.once("error", fail);
    doc.end();
  });
}

module.exports = {
  pipeMaintenanceReceiptPDF,
};
