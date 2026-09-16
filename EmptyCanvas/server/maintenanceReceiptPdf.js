const PDFDocument = require("pdfkit");
const path = require("path");
const { attachPageNumbers } = require("./pdfPageNumbers");
const { drawStocktakingHeader } = require("./pdfHeader");
const { containsArabic, enableArabicPdf, ensurePdfArabicSupport, withNativeArabicPdfText } = require("./pdfArabicSupport");

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

// PDFKit/fontkit can shape Arabic glyphs, but it does not fully reorder RTL
// word runs. Keep Arabic logical text in native-shaping mode and reverse the
// visual word order per line so the final PDF reads naturally from right to left.
function reverseRtlWordsForNativePdfLine(value) {
  const words = String(value || "").trim().match(/\S+/g) || [];
  return words.reverse().join(" ");
}

function prepareNativeRtlPdfText(doc, value, maxWidth) {
  const input = String(value || "").replace(/\r\n?/g, "\n");
  if (!input) return "";

  const width = Number(maxWidth);
  const canMeasure = doc && typeof doc.widthOfString === "function" && Number.isFinite(width) && width > 0;

  return input
    .split("\n")
    .map((sourceLine) => {
      const rawLine = String(sourceLine || "").trim();
      if (!rawLine) return "";

      const words = rawLine.match(/\S+/g) || [];
      if (!canMeasure || words.length <= 1) return reverseRtlWordsForNativePdfLine(rawLine);

      const logicalLines = [];
      let current = [];
      for (const word of words) {
        const candidate = current.concat(word);
        const visualCandidate = candidate.slice().reverse().join(" ");
        const candidateWidth = doc.widthOfString(visualCandidate);
        if (current.length && candidateWidth > width) {
          logicalLines.push(current);
          current = [word];
        } else {
          current = candidate;
        }
      }
      if (current.length) logicalLines.push(current);

      return logicalLines.map((logicalLine) => logicalLine.slice().reverse().join(" ")).join("\n");
    })
    .join("\n");
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
  const templateMode = Boolean(params.template);
  const provided = Array.isArray(params.componentLogs) ? params.componentLogs : [];
  if (provided.length) {
    return provided.map((item) => ({
      idCode: ensureText(item?.idCode, ""),
      component: ensureText(item?.component, "Unknown Component"),
      issueDescription: ensureText(item?.issueDescription || item?.issue, "No Issue"),
      serialNumber: templateMode ? "" : ensureText(item?.serialNumber, "—"),
      actualIssueDescription: templateMode ? "" : ensureText(item?.actualIssueDescription),
      repairAction: templateMode ? "" : ensureText(item?.repairAction),
      resolutionMethod: templateMode ? "" : ensureText(item?.resolutionMethod),
      sparePartsNeeded: templateMode ? [] : normalizeSpareParts({ spareParts: item?.sparePartsNeeded || [] }),
      spareParts: templateMode ? [] : normalizeSpareParts(item),
      maintenanceChecklist: Array.isArray(item?.maintenanceChecklist)
        ? item.maintenanceChecklist.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
    }));
  }

  const rows = Array.isArray(params.rows) && params.rows.length ? params.rows : [{ component: "Maintenance order" }];
  return rows.map((row) => ({
    idCode: ensureText(row?.idCode, ""),
    component: ensureText(row?.component, "Unknown Component"),
    issueDescription: ensureText(params.issueDescription || row?.issue || row?.reason, "No Issue"),
    serialNumber: templateMode ? "" : ensureText(row?.serialNumber || params.serialNumber, "—"),
    actualIssueDescription: templateMode ? "" : ensureText(params.actualIssueDescription),
    repairAction: templateMode ? "" : ensureText(params.repairAction),
    resolutionMethod: templateMode ? "" : ensureText(params.resolutionMethod),
    sparePartsNeeded: [],
    spareParts: templateMode ? [] : uniqueTextList(params.sparePartsReplacedList || params.sparePartsReplaced || [])
      .map((name) => ({ name, idCode: "", unit: 0, qty: 1, total: 0 })),
    maintenanceChecklist: Array.isArray(params.checklist)
      ? params.checklist.map((value) => String(value || "").trim()).filter(Boolean)
      : [],
  }));
}

async function pipeMaintenanceReceiptPDF(params = {}, stream) {
  await ensurePdfArabicSupport();
  const templateMode = Boolean(params.template);
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

  const makeValueLayout = (value, width, fontSize = 8.8, fontName = "Helvetica", lineGap = 1) => {
    const raw = ensureText(value);
    const isArabic = containsArabic(raw);
    const build = () => {
      doc.font(fontName).fontSize(fontSize);
      const display = isArabic ? prepareNativeRtlPdfText(doc, raw, width) : raw;
      const align = isArabic ? "right" : "left";
      const height = doc.heightOfString(display, { width, lineGap, align });
      return { display, isArabic, align, height };
    };
    return isArabic ? withNativeArabicPdfText(doc, build) : build();
  };

  const drawValueLayout = (layout, x, y, width, { fontName = "Helvetica", fontSize = 8.8, lineGap = 1, color = COLORS.text, align } = {}) => {
    const render = () => doc.fillColor(color).font(fontName).fontSize(fontSize).text(layout.display, x, y, {
      width,
      lineGap,
      align: align || layout.align,
    });
    return layout.isArabic ? withNativeArabicPdfText(doc, render) : render();
  };

  const drawMetaCard = (x, y, w, label, value) => {
    const layout = makeValueLayout(value, w - 22, 10.5, "Helvetica-Bold", 1);
    const h = Math.max(52, layout.height + 34);
    doc.save();
    doc.roundedRect(x, y, w, h, 13).fillAndStroke("#FFFFFF", COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.5).text(label, x + 11, y + 10, { width: w - 22 });
    drawValueLayout(layout, x + 11, y + 27, w - 22, { fontName: "Helvetica-Bold", fontSize: 10.5, lineGap: 1 });
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

  const textHeight = (value, width, fontSize = 8.8) => makeValueLayout(value, width, fontSize, "Helvetica", 1).height;

  const measureSmallField = (w, value) => {
    const valueH = textHeight(value, w - 18, 8.8);
    return Math.max(46, 10 + 10 + 4 + valueH + 10);
  };

  const drawSmallField = (x, y, w, label, value) => {
    const layout = makeValueLayout(value, w - 18, 8.8, "Helvetica", 1);
    const h = Math.max(46, 10 + 10 + 4 + layout.height + 10);
    doc.save();
    doc.roundedRect(x, y, w, h, 9).fillAndStroke(COLORS.soft, COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(label, x + 9, y + 9, { width: w - 18 });
    drawValueLayout(layout, x + 9, y + 24, w - 18, { fontName: "Helvetica", fontSize: 8.8, lineGap: 1 });
    doc.restore();
    return h;
  };

  const measureRuledField = (lineCount = 1) => Math.max(52, 34 + Math.max(1, Number(lineCount) || 1) * 18);

  const drawRuledField = (x, y, w, label, lineCount = 1) => {
    const count = Math.max(1, Number(lineCount) || 1);
    const h = measureRuledField(count);
    doc.save();
    doc.roundedRect(x, y, w, h, 9).fillAndStroke(COLORS.soft, COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(label, x + 9, y + 9, { width: w - 18 });
    doc.strokeColor("#9CA3AF").lineWidth(0.7);
    const firstY = y + 34;
    const spacing = 18;
    for (let index = 0; index < count; index += 1) {
      const lineY = firstY + index * spacing;
      doc.moveTo(x + 10, lineY).lineTo(x + w - 10, lineY).stroke();
    }
    doc.restore();
    return h;
  };

  const normalizeSparePartColumns = (value) => {
    const allowed = ["idCode", "component", "qty", "unitCost", "totalCost"];
    const requested = Array.isArray(value) ? value.filter((key) => allowed.includes(String(key || ""))) : [];
    return requested.length ? Array.from(new Set(requested)) : allowed;
  };

  const sparePartColumns = normalizeSparePartColumns(params.sparePartColumns);

  const spareTableLayout = (w) => {
    const labels = { idCode: "ID Code", component: "Component", qty: "Qty", unitCost: "Unit Cost", totalCost: "Total Cost" };
    const preferred = { idCode: 72, component: 150, qty: 44, unitCost: 66, totalCost: 72 };
    const numeric = new Set(["qty", "unitCost", "totalCost"]);
    const numberW = 24;
    const inner = Math.max(100, w - 18 - numberW);
    const selected = sparePartColumns.map((key) => ({ key, label: labels[key], width: preferred[key] || 70, numeric: numeric.has(key) }));
    let totalPreferred = selected.reduce((sum, col) => sum + col.width, 0);
    if (!selected.length) return { numberW, columns: [] };
    if (totalPreferred < inner) {
      const found = selected.findIndex((col) => col.key === "component" || col.key === "idCode");
      const flexIndex = found >= 0 ? found : 0;
      selected[flexIndex].width += inner - totalPreferred;
    } else if (totalPreferred > inner) {
      const scale = inner / totalPreferred;
      selected.forEach((col) => { col.width = Math.max(col.numeric ? 38 : 54, col.width * scale); });
      totalPreferred = selected.reduce((sum, col) => sum + col.width, 0);
      if (totalPreferred > inner) selected[0].width = Math.max(44, selected[0].width - (totalPreferred - inner));
    }
    return { numberW, columns: selected };
  };

  const spareCellText = (part, key) => {
    if (key === "idCode") return String(part?.idCode || "").trim() || "—";
    if (key === "component") return ensureText(part?.name, "Spare part");
    if (key === "qty") return String(Number(part?.qty) || 1);
    if (key === "unitCost") return money(part?.unit);
    if (key === "totalCost") return money(part?.total);
    return "";
  };

  const measureTemplateSparePartsTable = (w, rowCount = 3) => {
    const totalH = sparePartColumns.includes("totalCost") ? 24 : 0;
    return 22 + 22 + Math.max(3, Number(rowCount) || 3) * 27 + totalH;
  };

  const drawTemplateSparePartsTable = (x, y, w, title, rowCount = 3) => {
    const rows = Math.max(3, Number(rowCount) || 3);
    const titleH = 22;
    const headerH = 22;
    const rowH = 27;
    const totalH = sparePartColumns.includes("totalCost") ? 24 : 0;
    const tableH = measureTemplateSparePartsTable(w, rows);
    const layout = spareTableLayout(w);
    doc.save();
    doc.roundedRect(x, y, w, tableH, 10).fillAndStroke("#FFFFFF", COLORS.border);
    doc.rect(x, y, w, titleH).fill(COLORS.softOrange);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.8).text(title, x + 9, y + 7, { width: w - 18 });
    const headerY = y + titleH;
    doc.rect(x, headerY, w, headerH).fill(COLORS.soft2);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.1);
    doc.text("#", x + 9, headerY + 7, { width: layout.numberW });
    let cursorX = x + 9 + layout.numberW;
    layout.columns.forEach((col) => {
      doc.text(col.label, cursorX, headerY + 7, { width: col.width - 4, align: col.numeric ? "right" : "left" });
      cursorX += col.width;
    });
    doc.strokeColor(COLORS.border).lineWidth(0.8).moveTo(x, headerY + headerH).lineTo(x + w, headerY + headerH).stroke();
    for (let index = 0; index < rows; index += 1) {
      const rowY = headerY + headerH + index * rowH;
      if (index > 0) doc.moveTo(x, rowY).lineTo(x + w, rowY).strokeColor(COLORS.border).stroke();
      doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.2).text(String(index + 1), x + 9, rowY + 8, { width: layout.numberW });
      cursorX = x + 9 + layout.numberW;
      layout.columns.forEach((col) => {
        doc.strokeColor("#9CA3AF").lineWidth(0.7);
        doc.moveTo(cursorX + 3, rowY + 19).lineTo(cursorX + col.width - 7, rowY + 19).stroke();
        cursorX += col.width;
      });
    }
    if (totalH) {
      const totalY = headerY + headerH + rows * rowH;
      doc.moveTo(x, totalY).lineTo(x + w, totalY).strokeColor(COLORS.border).stroke();
      doc.rect(x, totalY, w, totalH).fill(COLORS.softOrange);
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9).text("Total Cost", x + 9, totalY + 7, { width: w - 100 });
      doc.strokeColor("#9CA3AF").lineWidth(0.7).moveTo(x + w - 86, totalY + 17).lineTo(x + w - 10, totalY + 17).stroke();
    }
    doc.restore();
    return tableH;
  };

  const measureSparePartsTable = (w, parts = []) => {
    const safeParts = Array.isArray(parts) ? parts : [];
    const rows = safeParts.length ? safeParts : [{ name: "", empty: true }];
    const totalH = sparePartColumns.includes("totalCost") ? 24 : 0;
    const layout = spareTableLayout(w);
    let bodyH = 0;
    rows.forEach((part) => {
      if (part.empty) { bodyH += 28; return; }
      let maxH = 10;
      layout.columns.forEach((col) => {
        maxH = Math.max(maxH, textHeight(spareCellText(part, col.key), Math.max(20, col.width - 8), 8.2));
      });
      bodyH += Math.max(25, maxH + 13);
    });
    return 22 + 22 + bodyH + totalH;
  };

  const drawSparePartsTable = (x, y, w, title, parts = [], emptyText = "No spare parts") => {
    const safeParts = Array.isArray(parts) ? parts : [];
    const rows = safeParts.length ? safeParts : [{ name: emptyText, empty: true }];
    const titleH = 22;
    const headerH = 22;
    const tableH = measureSparePartsTable(w, parts);
    const totalCost = safeParts.reduce((sum, part) => sum + (Number(part.total) || 0), 0);
    const totalH = sparePartColumns.includes("totalCost") ? 24 : 0;
    const layout = spareTableLayout(w);
    doc.save();
    doc.roundedRect(x, y, w, tableH, 10).fillAndStroke("#FFFFFF", COLORS.border);
    doc.rect(x, y, w, titleH).fill(COLORS.softOrange);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.8).text(title, x + 9, y + 7, { width: w - 18 });
    const headerY = y + titleH;
    doc.rect(x, headerY, w, headerH).fill(COLORS.soft2);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.1);
    doc.text("#", x + 9, headerY + 7, { width: layout.numberW });
    let cursorX = x + 9 + layout.numberW;
    layout.columns.forEach((col) => {
      doc.text(col.label, cursorX, headerY + 7, { width: col.width - 4, align: col.numeric ? "right" : "left" });
      cursorX += col.width;
    });
    doc.strokeColor(COLORS.border).lineWidth(0.8).moveTo(x, headerY + headerH).lineTo(x + w, headerY + headerH).stroke();
    let rowY = headerY + headerH;
    rows.forEach((part, idx) => {
      if (idx > 0) doc.moveTo(x, rowY).lineTo(x + w, rowY).strokeColor(COLORS.border).stroke();
      if (part.empty) {
        doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.5).text(emptyText, x + 9, rowY + 8, { width: w - 18, align: "center" });
        rowY += 28;
        return;
      }
      let maxH = 10;
      layout.columns.forEach((col) => {
        maxH = Math.max(maxH, textHeight(spareCellText(part, col.key), Math.max(20, col.width - 8), 8.2));
      });
      const rowH = Math.max(25, maxH + 13);
      doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.2).text(String(idx + 1), x + 9, rowY + 7, { width: layout.numberW });
      cursorX = x + 9 + layout.numberW;
      layout.columns.forEach((col) => {
        const value = spareCellText(part, col.key);
        const layoutValue = makeValueLayout(value, Math.max(20, col.width - 8), 8.2, col.numeric ? "Helvetica-Bold" : "Helvetica", 1);
        drawValueLayout(layoutValue, cursorX, rowY + 7, Math.max(20, col.width - 8), { fontName: col.numeric ? "Helvetica-Bold" : "Helvetica", fontSize: 8.2, lineGap: 1, align: col.numeric ? "right" : undefined });
        cursorX += col.width;
      });
      rowY += rowH;
    });
    if (totalH) {
      doc.moveTo(x, rowY).lineTo(x + w, rowY).strokeColor(COLORS.border).stroke();
      doc.rect(x, rowY, w, totalH).fill(COLORS.softOrange);
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9).text("Total Cost", x + 9, rowY + 7, { width: w - 100 });
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9).text(money(totalCost), x + w - 88, rowY + 7, { width: 78, align: "right" });
    }
    doc.restore();
    return tableH;
  };

  const measureChecklistBlock = (w, items = []) => {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return 0;
    let h = 36;
    values.forEach((value) => { h += Math.max(22, textHeight(value, w - 48, 8.6) + 10); });
    return h + 8;
  };

  const drawChecklistBlock = (x, y, w, items = [], checked = false) => {
    const values = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!values.length) return 0;
    const h = measureChecklistBlock(w, values);
    doc.save();
    doc.roundedRect(x, y, w, h, 10).fillAndStroke("#FFFFFF", COLORS.border);
    doc.rect(x, y, w, 24).fill(COLORS.soft2);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.8).text("Maintenance Checklist", x + 9, y + 8, { width: w - 18 });
    let rowY = y + 31;
    values.forEach((value) => {
      const layout = makeValueLayout(value, w - 48, 8.6, "Helvetica", 1);
      const rowH = Math.max(22, layout.height + 10);
      const boxX = x + 11;
      const boxY = rowY + 2;
      doc.strokeColor("#64748B").lineWidth(0.8).rect(boxX, boxY, 10, 10).stroke();
      if (checked) {
        doc.strokeColor(COLORS.accent).lineWidth(1.4).moveTo(boxX + 2, boxY + 5).lineTo(boxX + 4.5, boxY + 8).lineTo(boxX + 9, boxY + 2).stroke();
      }
      drawValueLayout(layout, x + 30, rowY, w - 41, { fontName: "Helvetica", fontSize: 8.6, lineGap: 1 });
      rowY += rowH;
    });
    doc.restore();
    return h;
  };

  const maintenanceDetailsMeasure = (item, template = false) => {
    const { contentW } = metrics();
    const innerW = contentW - 24;
    const gap = 8;
    const fieldW = (innerW - gap) / 2;
    const issueH = template
      ? measureSmallField(innerW, item.issueDescription)
      : Math.max(measureSmallField(fieldW, item.issueDescription), measureSmallField(fieldW, item.resolutionMethod));
    const serialH = template ? Math.max(measureRuledField(1), measureRuledField(2)) : 0;
    const actionH = template
      ? Math.max(measureRuledField(3), measureRuledField(3))
      : Math.max(measureSmallField(fieldW, item.actualIssueDescription), measureSmallField(fieldW, item.repairAction));
    return template
      ? 52 + issueH + gap + serialH + gap + actionH + 14
      : 52 + issueH + gap + actionH + 14;
  };

  const drawMaintenanceDetailsFields = (item, index, y, template = false, suffix = "") => {
    const { mL, contentW } = metrics();
    const innerW = contentW - 24;
    const gap = 8;
    const fieldW = (innerW - gap) / 2;
    const detailsH = maintenanceDetailsMeasure(item, template);
    doc.save();
    doc.roundedRect(mL, y, contentW, detailsH, 15).fillAndStroke("#FFFFFF", COLORS.cardBorder);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11.5).text(`Maintenance for Component ${index + 1}${suffix}`, mL + 12, y + 12, { width: contentW - 24 });
    const subtitle = [
      item.idCode ? `ID: ${item.idCode}` : "",
      !template && item.serialNumber && item.serialNumber !== "—" ? `Serial: ${item.serialNumber}` : "",
      item.component,
    ].filter(Boolean).join("  •  ");
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9.2).text(subtitle || "Unknown Component", mL + 12, y + 30, { width: contentW - 24 });
    doc.restore();

    let fy = y + 52;
    if (template) {
      const issueH = drawSmallField(mL + 12, fy, innerW, "Initial Issue", item.issueDescription);
      fy += issueH + gap;
      const serialH = Math.max(
        drawRuledField(mL + 12, fy, fieldW, "Serial Number", 1),
        drawRuledField(mL + 12 + fieldW + gap, fy, fieldW, "Resolution Method", 2),
      );
      fy += serialH + gap;
      Math.max(
        drawRuledField(mL + 12, fy, fieldW, "Actual Issue Description", 3),
        drawRuledField(mL + 12 + fieldW + gap, fy, fieldW, "Repair Action", 3),
      );
    } else {
      const issueH = Math.max(
        drawSmallField(mL + 12, fy, fieldW, "Initial Issue", item.issueDescription),
        drawSmallField(mL + 12 + fieldW + gap, fy, fieldW, "Resolution Method", item.resolutionMethod),
      );
      fy += issueH + gap;
      Math.max(
        drawSmallField(mL + 12, fy, fieldW, "Actual Issue Description", item.actualIssueDescription),
        drawSmallField(mL + 12 + fieldW + gap, fy, fieldW, "Repair Action", item.repairAction),
      );
    }
    return detailsH;
  };

  const drawContinuationLabel = (index) => {
    ensureSpace(28);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10).text(`Component ${index + 1} — maintenance details continued`, metrics().mL, doc.y, { width: metrics().contentW });
    doc.moveDown(0.3);
  };

  const drawMaintenanceTemplateCard = (item, index) => {
    const { mL, contentW } = metrics();
    const innerW = contentW - 24;
    const gap = 8;
    const detailsH = maintenanceDetailsMeasure(item, true);
    const neededH = measureTemplateSparePartsTable(innerW, 3);
    const replacedH = measureTemplateSparePartsTable(innerW, 3);
    const checklistItems = Array.isArray(item.maintenanceChecklist) ? item.maintenanceChecklist : [];
    const checklistH = measureChecklistBlock(innerW, checklistItems);
    const fullH = detailsH + gap + neededH + gap + replacedH + (checklistH ? gap + checklistH : 0) + 14;

    if (doc.y + fullH + 10 <= metrics().maxY) {
      const y = doc.y;
      drawMaintenanceDetailsFields(item, index, y, true);
      let fy = y + detailsH + gap;
      drawTemplateSparePartsTable(mL + 12, fy, innerW, "Spare Parts Needed", 3);
      fy += neededH + gap;
      drawTemplateSparePartsTable(mL + 12, fy, innerW, "Spare Parts Replaced", 3);
      fy += replacedH;
      if (checklistH) {
        fy += gap;
        drawChecklistBlock(mL + 12, fy, innerW, checklistItems, false);
        fy += checklistH;
      }
      doc.y = fy + 10;
      return;
    }

    ensureSpace(Math.min(detailsH + 10, 180));
    if (doc.y + detailsH + 10 > metrics().maxY) { doc.addPage(); drawHeader(true); }
    let y = doc.y;
    drawMaintenanceDetailsFields(item, index, y, true);
    doc.y = y + detailsH + 10;

    const sections = [
      { h: neededH, draw: (yy) => drawTemplateSparePartsTable(mL, yy, contentW, "Spare Parts Needed", 3) },
      { h: replacedH, draw: (yy) => drawTemplateSparePartsTable(mL, yy, contentW, "Spare Parts Replaced", 3) },
      ...(checklistH ? [{ h: checklistH, draw: (yy) => drawChecklistBlock(mL, yy, contentW, checklistItems, false) }] : []),
    ];
    sections.forEach((section) => {
      if (doc.y + section.h + 10 > metrics().maxY) { doc.addPage(); drawHeader(true); drawContinuationLabel(index); }
      section.draw(doc.y);
      doc.y += section.h + 10;
    });
  };

  const drawMaintenanceCard = (item, index) => {
    const { mL, contentW } = metrics();
    const innerW = contentW - 24;
    const gap = 8;
    const needed = Array.isArray(item.sparePartsNeeded) ? item.sparePartsNeeded : [];
    const replaced = Array.isArray(item.spareParts) ? item.spareParts : [];
    const checklistItems = Array.isArray(item.maintenanceChecklist) ? item.maintenanceChecklist : [];
    const detailsH = maintenanceDetailsMeasure(item, false);
    const neededH = measureSparePartsTable(innerW, needed);
    const replacedH = measureSparePartsTable(innerW, replaced);
    const checklistH = measureChecklistBlock(innerW, checklistItems);
    const fullH = detailsH + gap + neededH + gap + replacedH + (checklistH ? gap + checklistH : 0) + 14;

    if (doc.y + fullH + 10 <= metrics().maxY) {
      const y = doc.y;
      drawMaintenanceDetailsFields(item, index, y, false);
      let fy = y + detailsH + gap;
      drawSparePartsTable(mL + 12, fy, innerW, "Spare Parts Needed", needed, "No spare parts needed");
      fy += neededH + gap;
      drawSparePartsTable(mL + 12, fy, innerW, "Spare Parts Replaced", replaced, "No spare parts replaced");
      fy += replacedH;
      if (checklistH) {
        fy += gap;
        drawChecklistBlock(mL + 12, fy, innerW, checklistItems, true);
        fy += checklistH;
      }
      doc.y = fy + 10;
      return;
    }

    ensureSpace(Math.min(detailsH + 10, 180));
    if (doc.y + detailsH + 10 > metrics().maxY) { doc.addPage(); drawHeader(true); }
    let y = doc.y;
    drawMaintenanceDetailsFields(item, index, y, false);
    doc.y = y + detailsH + 10;

    const sections = [
      { h: measureSparePartsTable(contentW, needed), draw: (yy) => drawSparePartsTable(mL, yy, contentW, "Spare Parts Needed", needed, "No spare parts needed") },
      { h: measureSparePartsTable(contentW, replaced), draw: (yy) => drawSparePartsTable(mL, yy, contentW, "Spare Parts Replaced", replaced, "No spare parts replaced") },
      ...(checklistItems.length ? [{ h: measureChecklistBlock(contentW, checklistItems), draw: (yy) => drawChecklistBlock(mL, yy, contentW, checklistItems, true) }] : []),
    ];
    sections.forEach((section) => {
      if (doc.y + section.h + 10 > metrics().maxY) { doc.addPage(); drawHeader(true); drawContinuationLabel(index); }
      section.draw(doc.y);
      doc.y += section.h + 10;
    });
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
  componentLogs.forEach((item, index) => {
    if (templateMode) drawMaintenanceTemplateCard(item, index);
    else drawMaintenanceCard(item, index);
  });
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
