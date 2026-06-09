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
      sparePartsReplacedNames: uniqueTextList(
        item?.sparePartsReplacedNames?.length
          ? item.sparePartsReplacedNames
          : (item?.sparePartsReplacedName || item?.sparePartsReplaced || []),
      ),
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
    sparePartsReplacedNames: uniqueTextList(params.sparePartsReplacedList || params.sparePartsReplaced || []),
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
    soft: "#F9FAFB",
    soft2: "#F3F4F6",
    dark: "#111827",
    accent: "#EA580C",
  };

  const logoPath = path.join(__dirname, "..", "public", "images", "logo.png");

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
      maxY: pageH - mB - 28,
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
    ensureSpace(34);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(13).text(String(title || "").trim(), metrics().mL, doc.y, {
      width: metrics().contentW,
    });
    doc.moveDown(0.45);
  };

  const drawMetaCard = (x, y, w, label, value) => {
    const text = ensureText(value);
    doc.font("Helvetica").fontSize(11);
    const h = Math.max(56, doc.heightOfString(text, { width: w - 24 }) + 38);
    doc.save();
    doc.roundedRect(x, y, w, h, 14).fillAndStroke("#FFFFFF", COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9).text(label, x + 12, y + 12, { width: w - 24 });
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11).text(text, x + 12, y + 30, {
      width: w - 24,
      lineGap: 2,
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
    doc.y = y + Math.max(...heights) + 18;
  };

  const textHeight = (value, width, fontSize = 9) => {
    doc.font("Helvetica").fontSize(fontSize);
    return doc.heightOfString(ensureText(value), { width, lineGap: 1 });
  };

  const measureSmallField = (w, value) => {
    const labelH = 11;
    const valueH = textHeight(value, w - 20, 9.5);
    return Math.max(52, 12 + labelH + 6 + valueH + 12);
  };

  const drawSmallField = (x, y, w, label, value) => {
    const h = measureSmallField(w, value);
    const valueText = ensureText(value);
    doc.save();
    doc.roundedRect(x, y, w, h, 10).fillAndStroke(COLORS.soft, COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.5).text(label, x + 10, y + 10, { width: w - 20 });
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(9.5).text(valueText, x + 10, y + 28, {
      width: w - 20,
      lineGap: 1,
    });
    doc.restore();
    return h;
  };

  const drawSparePartsTable = (x, y, w, parts = []) => {
    const safeParts = uniqueTextList(parts);
    const headerH = 24;
    const rowH = 24;
    const tableH = headerH + Math.max(1, safeParts.length) * rowH;

    doc.save();
    doc.roundedRect(x, y, w, tableH, 10).fillAndStroke("#FFFFFF", COLORS.border);
    doc.rect(x, y, w, headerH).fill(COLORS.soft2);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9);
    doc.text("#", x + 10, y + 8, { width: 28 });
    doc.text("Spare Parts Replacement", x + 42, y + 8, { width: w - 54 });
    doc.strokeColor(COLORS.border).lineWidth(0.8).moveTo(x, y + headerH).lineTo(x + w, y + headerH).stroke();

    const rows = safeParts.length ? safeParts : ["No spare parts replaced"];
    rows.forEach((part, idx) => {
      const ry = y + headerH + idx * rowH;
      if (idx > 0) doc.moveTo(x, ry).lineTo(x + w, ry).strokeColor(COLORS.border).stroke();
      doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9).text(safeParts.length ? String(idx + 1) : "—", x + 10, ry + 7, { width: 28 });
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(9).text(part, x + 42, ry + 7, { width: w - 54 });
    });
    doc.restore();
    return tableH;
  };

  const drawMaintenanceCard = (item, index) => {
    const { mL, contentW } = metrics();
    const fieldsGap = 8;
    const fieldW = (contentW - 24 - fieldsGap) / 2;
    const spareParts = uniqueTextList(item.sparePartsReplacedNames || item.sparePartsReplacedName || []);

    const issueH = Math.max(
      measureSmallField(fieldW, item.issueDescription),
      measureSmallField(fieldW, item.resolutionMethod),
    );
    const actionH = Math.max(
      measureSmallField(fieldW, item.actualIssueDescription),
      measureSmallField(fieldW, item.repairAction),
    );
    const tableH = 24 + Math.max(1, spareParts.length) * 24;
    const cardH = 62 + issueH + fieldsGap + actionH + 12 + tableH + 20;

    ensureSpace(cardH + 12);
    const y = doc.y;
    doc.save();
    doc.roundedRect(mL, y, contentW, cardH, 16).fillAndStroke("#FFFFFF", COLORS.border);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(12).text(`Maintenance for Component ${index + 1}`, mL + 14, y + 14, {
      width: contentW - 28,
    });
    const subtitle = [item.idCode ? `ID: ${item.idCode}` : "", item.component].filter(Boolean).join("  •  ");
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10).text(subtitle || "Unknown Component", mL + 14, y + 34, {
      width: contentW - 28,
    });
    doc.restore();

    let fy = y + 58;
    drawSmallField(mL + 12, fy, fieldW, "Initial Issue", item.issueDescription);
    drawSmallField(mL + 12 + fieldW + fieldsGap, fy, fieldW, "Resolution Method", item.resolutionMethod);
    fy += issueH + fieldsGap;
    drawSmallField(mL + 12, fy, fieldW, "Actual Issue Description", item.actualIssueDescription);
    drawSmallField(mL + 12 + fieldW + fieldsGap, fy, fieldW, "Repair Action", item.repairAction);
    fy += actionH + 12;
    drawSparePartsTable(mL + 12, fy, contentW - 24, spareParts);

    doc.y = y + cardH + 12;
  };

  const drawSignatureBox = (x, y, w, title) => {
    const h = 108;
    doc.save();
    doc.roundedRect(x, y, w, h, 14).fillAndStroke("#FFFFFF", COLORS.border);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10).text(title, x + 14, y + 12, { width: w - 28 });
    doc.strokeColor(COLORS.border).lineWidth(1).moveTo(x + 14, y + 58).lineTo(x + w - 14, y + 58).stroke();
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8.5).text("Name / Signature / Date", x + 14, y + 66, { width: w - 28 });
    doc.restore();
    return h;
  };

  const drawSignatures = () => {
    ensureSpace(150);
    drawSectionTitle("Signatures");
    const { mL, contentW } = metrics();
    const gap = 14;
    const w = (contentW - gap) / 2;
    const y = doc.y;
    const h1 = drawSignatureBox(mL, y, w, "Technician Signature");
    const h2 = drawSignatureBox(mL + w + gap, y, w, "Machine Owner Signature");
    doc.y = y + Math.max(h1, h2) + 12;
  };

  drawHeader(false);
  drawOrderData();

  const componentLogs = buildComponentLogs(params);
  drawSectionTitle("Maintenance Details");
  componentLogs.forEach((item, index) => drawMaintenanceCard(item, index));
  drawSignatures();

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
