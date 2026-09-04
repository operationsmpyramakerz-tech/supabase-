const PDFDocument = require("pdfkit");
const path = require("path");
const { attachPageNumbers } = require("./pdfPageNumbers");
const { drawStocktakingHeader } = require("./pdfHeader");
const { enableArabicPdf, ensurePdfArabicSupport } = require("./pdfArabicSupport");

function moneyGBP(n) {
  const num = Number(n) || 0;
  return `£${num.toFixed(2)}`;
}

function formatDateTime(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return String(date || "-");
    // Matches UI style like: 8 Jan 2026, 09:36
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

function normalizeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("www.")) return `https://${s}`;
  // Avoid creating broken links
  return null;
}


// Pastel palette (similar to Stocktaking tags UI)
const TAG_PALETTE = [
  { bg: "#FDF2F8", border: "#FBCFE8", text: "#9D174D", pill: "#FCE7F3" }, // pink
  { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", pill: "#D1FAE5" }, // green
  { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF", pill: "#DBEAFE" }, // blue
  { bg: "#FEFCE8", border: "#FDE68A", text: "#92400E", pill: "#FEF3C7" }, // yellow
  { bg: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6", pill: "#EDE9FE" }, // purple
  { bg: "#FFF7ED", border: "#FED7AA", text: "#9A3412", pill: "#FFEDD5" }, // orange
  { bg: "#F0FDFA", border: "#99F6E4", text: "#115E59", pill: "#CCFBF1" }, // teal
];

function hashString(str) {
  const s = String(str || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0; // 32-bit
  }
  return h;
}

function pickTagColors(key) {
  const idx = Math.abs(hashString(key)) % TAG_PALETTE.length;
  return TAG_PALETTE[idx];
}

function groupByReason(rows) {
  const map = new Map();
  const order = [];
  for (const r of rows || []) {
    const reasonRaw = String(r?.reason || "").trim();
    const reason = reasonRaw || "No Reason";
    if (!map.has(reason)) {
      map.set(reason, []);
      order.push(reason);
    }
    map.get(reason).push(r);
  }

  // Sort (keep No Reason at the end)
  const noReason = order.filter((x) => x === "No Reason");
  const others = order
    .filter((x) => x !== "No Reason")
    .sort((a, b) => String(a).localeCompare(String(b)));
  const sorted = others.concat(noReason);

  return sorted.map((reason) => ({ reason, rows: map.get(reason) || [] }));
}

function normalizeExportGroupMode(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "product-tag") return "product-tag";
  if (key === "kit-tag") return "kit-tag";
  return "";
}

function naturalCompare(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
}

function groupByExportTag(rows, mode) {
  const groupMode = normalizeExportGroupMode(mode);
  if (!groupMode) return [];
  const map = new Map();
  for (const row of rows || []) {
    const isKit = groupMode === "kit-tag";
    const tag = isKit
      ? (String(row?.kitTag || row?.kit_tag || "").trim() || "Unassigned kit")
      : (String(row?.productTag || row?.product_tag || "").trim() || "Uncategorized");
    const folderName = isKit
      ? (String(row?.kitFolderName || row?.kit_folder_name || "").trim() || "Unfiled Kits")
      : "";
    const key = `${folderName.toLowerCase()}|${tag.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, {
        reason: tag,
        tag,
        folderName,
        label: isKit ? "Kit Tag" : "Product Tag",
        rows: [],
      });
    }
    map.get(key).rows.push(row);
  }
  return [...map.values()]
    .map((group) => ({
      ...group,
      rows: group.rows.slice().sort((a, b) => naturalCompare(a?.component, b?.component)),
    }))
    .sort((a, b) => naturalCompare(a.folderName, b.folderName) || naturalCompare(a.tag, b.tag));
}

function containsArabicText(value) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(value || ""));
}


function splitInstructionParagraphs(value) {
  const normalized = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];

  // Keep the same paragraph semantics as the browser preview: blank lines create
  // paragraph spacing, while single line breaks stay inside the same paragraph.
  return normalized
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitLegacyInstructionLanguages(value) {
  const paragraphs = splitInstructionParagraphs(value);
  const english = [];
  const arabic = [];
  for (const paragraph of paragraphs) {
    (containsArabicText(paragraph) ? arabic : english).push(paragraph);
  }
  return {
    englishText: english.join("\n\n"),
    arabicText: arabic.join("\n\n"),
  };
}

/**
 * Generate Delivery Receipt PDF and pipe it to a writable stream (e.g. Express res).
 *
 * Notes (customizations requested):
 * - Signature (handover confirmation) appears on EVERY page.
 * - Items are grouped by Reason (each group styled like a "tag" section).
 *
 * @param {Object} params
 * @param {string} params.orderId
 * @param {Date} params.createdAt
 * @param {string} params.teamMember
 * @param {string} params.preparedBy
 * @param {Array<{idCode?:string,component:string,reason:string,qty:number,unit:number,total:number}>} params.rows
 * @param {number} params.grandQty
 * @param {number} params.grandTotal
 * @param {import('stream').Writable} stream
 */
async function pipeDeliveryReceiptPDF(
  {
    orderId,
    createdAt,
    teamMember,
    preparedBy,
    rows,
    grandQty,
    grandTotal,
    // Optional layout overrides
    metaLayout = "default", // "default" | "teamReasonFirst"
    groupByReason: groupByReasonOpt = true,
    groupMode = "",
    showReasonTagBar: showReasonTagBarOpt = true,
    // Requested change:
    // Allow hiding price columns (Unit / Total) for some exports (e.g. Received/Delivered tabs).
    showCosts = true,
    // Used for header colors when grouping is disabled
    headerColorKey = null,
    documentTitle = "Delivery Receipt",
    recipientLabelLeft = "Delivered to",
    thirdSignatureLabel = null,
    signatureLabels = null,
    showFooterSignature = true,
    exportColumns = null,
    instructionTitle = "",
    instructionEnglishText = "",
    instructionArabicText = "",
    instructionText = "",
  },
  stream,
) {
  await ensurePdfArabicSupport();
  const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true });
  enableArabicPdf(doc);
  doc.pipe(stream);
  // Page numbering (helps ordering when printing/sharing)
  // Attach after piping so the first page number is included in the output stream.
  attachPageNumbers(doc);

  const COLORS = {
    border: "#E5E7EB",
    muted: "#6B7280",
    text: "#111827",
    zebra: "#FAFAFA",
  };

  const INCLUDE_FOOTER_SIGNATURE = showFooterSignature !== false;

  const safeRows = Array.isArray(rows) ? rows : [];

  // Default behavior keeps the original grouping by reason.
  // For Current Orders we can disable grouping & hide the reason tag bar.
  const singleKey =
    String(headerColorKey || preparedBy || orderId || "Order").trim() || "Order";
  const exportGroupMode = normalizeExportGroupMode(groupMode);
  const exportTagGroups = exportGroupMode ? groupByExportTag(safeRows, exportGroupMode) : [];
  const groups = exportTagGroups.length
    ? exportTagGroups
    : (groupByReasonOpt
        ? groupByReason(safeRows)
        : [{ reason: singleKey, label: "Reason", tag: singleKey, folderName: "", rows: safeRows }]);

  // Use the same logo/header style as the Stocktaking PDFs
  const logoPath = path.join(__dirname, "..", "public", "images", "logo.png");

  // Footer (signature) layout constants
  const FOOTER = {
    // Keep it compact to fit more table rows per page.
    titleFont: 11,
    titleLineH: 14,
    titleToBoxesGap: 6,
    boxH: 80,
    bottomGap: 6,
  };
  const FOOTER_RESERVED = INCLUDE_FOOTER_SIGNATURE
    ? (FOOTER.titleLineH + FOOTER.titleToBoxesGap + FOOTER.boxH + FOOTER.bottomGap + 6)
    : 0;

  function metrics() {
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const mL = doc.page.margins.left;
    const mR = doc.page.margins.right;
    const mT = doc.page.margins.top;
    const mB = doc.page.margins.bottom;
    const contentW = pageW - mL - mR;
    const bottomY = pageH - mB;
    const effectiveBottomY = bottomY - FOOTER_RESERVED;
    return { pageW, pageH, mL, mR, mT, mB, contentW, bottomY, effectiveBottomY };
  }

  function drawPageHeader({ compact = false } = {}) {
    // Match Stocktaking header style (logo LEFT + title + subtitle + divider)
    drawStocktakingHeader(doc, {
      title: String(documentTitle || "Delivery Receipt"),
      subtitle: `Order: ${String(orderId || "-")}  •  Generated: ${formatDateTime(createdAt)}`,
      variant: compact ? "compact" : "default",
      logoPath,
      colors: COLORS,
    });
  }

  function drawFooterSignature() {
    if (!INCLUDE_FOOTER_SIGNATURE) return;

    const { pageH, mL, mR, mB, contentW, bottomY } = metrics();

    const prevY = doc.y;
    doc.save();

    const footerBottom = bottomY;
    const boxesBottom = footerBottom - FOOTER.bottomGap;
    const boxesY = boxesBottom - FOOTER.boxH;
    const titleY = boxesY - (FOOTER.titleLineH + FOOTER.titleToBoxesGap);

    // Title
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(FOOTER.titleFont);
    doc.text("Handover confirmation", mL, titleY, { width: contentW, align: "left" });

    const customSignatureLabels = Array.isArray(signatureLabels)
      ? signatureLabels.map((label) => String(label || "").trim()).filter(Boolean)
      : [];
    const footerSignatureLabels = customSignatureLabels.length
      ? customSignatureLabels
      : [String(recipientLabelLeft || "Delivered to"), "Operations"];
    if (!customSignatureLabels.length && String(thirdSignatureLabel || "").trim()) {
      footerSignatureLabels.push(String(thirdSignatureLabel).trim());
    }

    const gap = 16;
    const boxCount = footerSignatureLabels.length;
    const boxW = (contentW - gap * Math.max(0, boxCount - 1)) / boxCount;
    const boxH = FOOTER.boxH;

    function drawSignatureBox(title, x, y) {
      doc.roundedRect(x, y, boxW, boxH, 10).lineWidth(1).strokeColor(COLORS.border).stroke();
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10);
      doc.text(title, x + 12, y + 10, { width: boxW - 24, align: "left" });

      const lineStartX = x + 12;
      const lineEndX = x + boxW - 12;

      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9);

      doc.text("Name", lineStartX, y + 34);
      doc
        .moveTo(lineStartX + 40, y + 45)
        .lineTo(lineEndX, y + 45)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();

      doc.text("Signature", lineStartX, y + 58);
      doc
        .moveTo(lineStartX + 55, y + 69)
        .lineTo(lineEndX, y + 69)
        .lineWidth(1)
        .strokeColor(COLORS.border)
        .stroke();
    }

    footerSignatureLabels.forEach((label, index) => {
      const x = mL + index * (boxW + gap);
      drawSignatureBox(label, x, boxesY);
    });

    doc.restore();
    doc.y = prevY;
  }

  function ensureSpace(neededHeight, { onNewPage } = {}) {
    const { effectiveBottomY } = metrics();
    if (doc.y + neededHeight <= effectiveBottomY) return;

    doc.addPage();
    drawPageHeader({ compact: true });
    drawFooterSignature();
    if (typeof onNewPage === "function") onNewPage();
  }

  // ======== Header (page 1) + footer ========
  drawPageHeader({ compact: false });
  drawFooterSignature();

  // ======== Optional instructions blocks (page 1, before order metadata) ========
  // English and Arabic are intentionally rendered in separate blocks. This keeps
  // the Arabic paragraph on the legacy visual-order shaping path, which is more
  // reliable than mixing LTR/RTL paragraphs inside one PDFKit text flow.
  const safeInstructionTitle = String(instructionTitle || "").trim();
  const legacyInstruction = splitLegacyInstructionLanguages(instructionText);
  const safeInstructionEnglish = String(instructionEnglishText || legacyInstruction.englishText || "").trim();
  const safeInstructionArabic = String(instructionArabicText || legacyInstruction.arabicText || "").trim();
  const showSelectedTitle = Boolean(safeInstructionTitle && safeInstructionTitle.toLowerCase() !== "instructions");
  const instructionTitleIsArabic = showSelectedTitle && containsArabicText(safeInstructionTitle);

  const drawInstructionLanguageBlock = ({ label, text, isArabic = false, title = "" }) => {
    const safeText = String(text || "").trim();
    if (!safeText) return;

    const { mL, contentW } = metrics();
    const padX = 12;
    const padY = 10;
    const headingSize = 10;
    const titleSize = 9.5;
    const bodySize = 9;
    const innerW = Math.max(1, contentW - padX * 2);
    const paragraphs = splitInstructionParagraphs(safeText);
    const paragraphGap = 8;
    const align = isArabic ? "right" : "left";

    doc.font("Helvetica-Bold").fontSize(headingSize);
    const headingH = doc.heightOfString(label, { width: innerW, lineGap: 1, align });
    const safeTitle = String(title || "").trim();
    const titleH = safeTitle
      ? doc.font("Helvetica-Bold").fontSize(titleSize).heightOfString(safeTitle, { width: innerW, lineGap: 1, align })
      : 0;
    const bodyHeights = paragraphs.map((paragraph) =>
      doc.font("Helvetica").fontSize(bodySize).heightOfString(paragraph, { width: innerW, lineGap: 2, align }),
    );
    const titleGap = safeTitle ? 5 : 0;
    const bodyGap = 6;
    const paragraphsH = bodyHeights.reduce((sum, height) => sum + height, 0)
      + Math.max(0, paragraphs.length - 1) * paragraphGap;
    const blockH = Math.max(58, padY + headingH + titleGap + titleH + bodyGap + paragraphsH + padY);

    ensureSpace(blockH + 14);
    const y = doc.y;
    doc.save();
    doc.roundedRect(mL, y, contentW, blockH, 9).fillAndStroke(
      isArabic ? "#F7FFFD" : "#FFFCF7",
      isArabic ? "#99F6E4" : "#FED7AA",
    );

    let cursorY = y + padY;
    doc.fillColor(isArabic ? "#0F766E" : "#9A3412").font("Helvetica-Bold").fontSize(headingSize).text(label, mL + padX, cursorY, {
      width: innerW,
      lineGap: 1,
      align,
    });
    cursorY += headingH;

    if (safeTitle) {
      cursorY += titleGap;
      doc.fillColor(isArabic ? "#0F766E" : "#B45309").font("Helvetica-Bold").fontSize(titleSize).text(safeTitle, mL + padX, cursorY, {
        width: innerW,
        lineGap: 1,
        align,
      });
      cursorY += titleH;
    }

    cursorY += bodyGap;
    paragraphs.forEach((paragraph, index) => {
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(bodySize).text(paragraph, mL + padX, cursorY, {
        width: innerW,
        lineGap: 2,
        align,
      });
      cursorY += bodyHeights[index] || 0;
      if (index < paragraphs.length - 1) cursorY += paragraphGap;
    });

    doc.restore();
    doc.y = y + blockH + 9;
  };

  if (safeInstructionEnglish || safeInstructionArabic) {
    drawInstructionLanguageBlock({
      label: "English Instructions",
      text: safeInstructionEnglish,
      isArabic: false,
      title: showSelectedTitle && !instructionTitleIsArabic ? safeInstructionTitle : "",
    });
    drawInstructionLanguageBlock({
      label: "التعليمات العربية",
      text: safeInstructionArabic,
      isArabic: true,
      title: showSelectedTitle && instructionTitleIsArabic ? safeInstructionTitle : "",
    });
    doc.y += 5;
  }

  // ======== Meta small table (page 1) ========
  const { pageW, pageH, mL, mR, mB, contentW } = metrics();
  const metaX = mL;
  const metaY = doc.y;
  const metaW = contentW;
  const metaColW = metaW / 2;
  const META = {
    padX: 10,
    padTop: 6,
    padBottom: 8,
    gapY: 3,
    labelFont: "Helvetica",
    labelSize: 9,
    valueFont: "Helvetica-Bold",
    valueSize: 11,
    minRowH: 30,
  };

  const metaRows = String(metaLayout || "").toLowerCase() === "teamreasonfirst"
    ? [
        [
          { label: "Team member", value: String(teamMember || "—") },
          { label: "Reason", value: String(preparedBy || "—") },
        ],
        [
          { label: "Order ID", value: String(orderId || "—") },
          { label: "Date", value: formatDateTime(createdAt) },
        ],
      ]
    : [
        [
          { label: "Order ID", value: String(orderId || "—") },
          { label: "Date", value: formatDateTime(createdAt) },
        ],
        [
          { label: "Team member", value: String(teamMember || "—") },
          { label: "Prepared by (Operations)", value: String(preparedBy || "—") },
        ],
      ];

  function measureMetaCellHeight(label, value, w) {
    const innerW = Math.max(1, w - META.padX * 2);
    const safeLabel = String(label || "—");
    const safeValue = String(value || "—");

    doc.font(META.labelFont).fontSize(META.labelSize);
    const labelH = doc.heightOfString(safeLabel, {
      width: innerW,
      align: "left",
      lineGap: 0,
    });

    doc.font(META.valueFont).fontSize(META.valueSize);
    const valueH = doc.heightOfString(safeValue, {
      width: innerW,
      align: "left",
      lineGap: 1,
    });

    return Math.max(
      META.minRowH,
      META.padTop + labelH + META.gapY + valueH + META.padBottom,
    );
  }

  function drawMetaCell(label, value, x, y, w) {
    const innerW = Math.max(1, w - META.padX * 2);
    const safeLabel = String(label || "—");
    const safeValue = String(value || "—");

    doc
      .fillColor(COLORS.muted)
      .font(META.labelFont)
      .fontSize(META.labelSize)
      .text(safeLabel, x + META.padX, y + META.padTop, {
        width: innerW,
        align: "left",
        lineGap: 0,
      });

    const labelH = doc
      .font(META.labelFont)
      .fontSize(META.labelSize)
      .heightOfString(safeLabel, {
        width: innerW,
        align: "left",
        lineGap: 0,
      });

    doc
      .fillColor(COLORS.text)
      .font(META.valueFont)
      .fontSize(META.valueSize)
      .text(safeValue, x + META.padX, y + META.padTop + labelH + META.gapY, {
        width: innerW,
        align: "left",
        lineGap: 1,
      });
  }

  const metaRowHeights = metaRows.map((row) =>
    Math.max(...row.map((cell) => measureMetaCellHeight(cell.label, cell.value, metaColW))),
  );
  const metaH = metaRowHeights.reduce((sum, h) => sum + h, 0);

  doc
    .roundedRect(metaX, metaY, metaW, metaH, 8)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();

  doc
    .moveTo(metaX + metaColW, metaY)
    .lineTo(metaX + metaColW, metaY + metaH)
    .strokeColor(COLORS.border)
    .stroke();

  let metaDividerY = metaY;
  metaRowHeights.slice(0, -1).forEach((rowH) => {
    metaDividerY += rowH;
    doc
      .moveTo(metaX, metaDividerY)
      .lineTo(metaX + metaW, metaDividerY)
      .strokeColor(COLORS.border)
      .stroke();
  });

  let metaRowY = metaY;
  metaRows.forEach((row, rowIndex) => {
    drawMetaCell(row[0].label, row[0].value, metaX, metaRowY, metaColW);
    drawMetaCell(row[1].label, row[1].value, metaX + metaColW, metaRowY, metaColW);
    metaRowY += metaRowHeights[rowIndex];
  });

  doc.y = metaY + metaH + 18;

  // ======== Items tables (grouped by Reason) ========
  const tableX = mL;
  const tableW = contentW;
  const headerH = 26;
  const cellPadX = 8;
  const tagBarH = 38;

  // Dynamic columns. If no explicit exportColumns are provided, keep the old defaults:
  // ID | Component | Qty | Unit | Total, or ID | Component | Qty when showCosts=false.
  const allColumnDefs = [
    { key: "idCode", label: "ID Code", ratio: 0.16, align: "left" },
    { key: "component", label: "Component", ratio: 0.38, align: "left" },
    { key: "qty", label: "Qty", ratio: 0.09, align: "right" },
    { key: "reason", label: "Reason", ratio: 0.20, align: "left" },
    { key: "issue", label: "Issue", ratio: 0.22, align: "left" },
    { key: "link", label: "Component link", ratio: 0.26, align: "left" },
    { key: "unit", label: "Unit", ratio: 0.12, align: "right" },
    { key: "total", label: "Total", ratio: 0.13, align: "right" },
  ];
  const defByKey = new Map(allColumnDefs.map((col) => [col.key, col]));
  const defaultKeys = showCosts
    ? ["idCode", "component", "qty", "unit", "total"]
    : ["idCode", "component", "qty"];
  const rawExportKeys = Array.isArray(exportColumns)
    ? exportColumns
    : String(exportColumns || "").split(",");
  let selectedKeys = rawExportKeys
    .map((key) => String(key || "").trim())
    .filter((key) => defByKey.has(key));
  if (!selectedKeys.length) selectedKeys = defaultKeys.slice();
  // The table needs at least one descriptive column, otherwise files are hard to read.
  if (!selectedKeys.includes("component")) selectedKeys.unshift("component");
  selectedKeys = Array.from(new Set(selectedKeys));

  const selectedDefs = selectedKeys.map((key) => defByKey.get(key)).filter(Boolean);
  const ratioSum = selectedDefs.reduce((sum, col) => sum + Number(col.ratio || 1), 0) || selectedDefs.length || 1;
  let accX = tableX;
  let usedW = 0;
  const columns = selectedDefs.map((def, idx) => {
    const isLast = idx === selectedDefs.length - 1;
    const width = isLast
      ? Math.max(40, tableW - usedW)
      : Math.max(44, Math.round(tableW * (Number(def.ratio || 1) / ratioSum)));
    const col = { ...def, width, x: accX };
    accX += width;
    usedW += width;
    return col;
  });
  const showGrandTotalSummary = columns.some((col) => col.key === "unit" || col.key === "total");

  function drawTagBar(group, count, tagColors) {
    const y = doc.y;
    const label = String(group?.label || (exportGroupMode ? (exportGroupMode === "kit-tag" ? "Kit Tag" : "Product Tag") : "Reason"));
    const pillText = String(group?.tag || group?.reason || "No Reason");
    const folderName = exportGroupMode === "kit-tag" ? String(group?.folderName || "Unfiled Kits") : "";

    doc
      .roundedRect(tableX, y, tableW, tagBarH, 10)
      .fill(tagColors.bg)
      .strokeColor(tagColors.border)
      .lineWidth(1)
      .stroke();

    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(9);
    doc.text(label, tableX + 12, y + 7, { width: 72, align: "left" });

    doc.font("Helvetica-Bold").fontSize(10);
    const pillW = Math.min(330, Math.max(76, doc.widthOfString(pillText) + 24));
    const pillX = tableX + 78;
    doc
      .roundedRect(pillX, y + 5, pillW, 19, 9)
      .fill(tagColors.pill)
      .strokeColor(tagColors.border)
      .lineWidth(1)
      .stroke();
    doc.fillColor(tagColors.text).text(pillText, pillX + 11, y + 9, {
      width: pillW - 22,
      align: "left",
      ellipsis: true,
    });

    if (folderName) {
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8);
      doc.text(folderName, pillX, y + 27, { width: Math.max(100, tableW - 170), align: "left", ellipsis: true });
    }

    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(9);
    doc.text(`${Number(count) || 0} items`, tableX + 12, y + 9, {
      width: tableW - 24,
      align: "right",
    });

    doc.y = y + tagBarH + 8;
  }

  function drawTableHeader(tagColors) {
    const y = doc.y;

    // background
    doc.rect(tableX, y, tableW, headerH).fill(tagColors.bg);

    // border
    doc
      .rect(tableX, y, tableW, headerH)
      .lineWidth(1)
      .strokeColor(tagColors.border)
      .stroke();

    // labels
    doc.fillColor(tagColors.text).font("Helvetica-Bold").fontSize(10);
    columns.forEach((c) => {
      doc.text(c.label, c.x + cellPadX, y + 8, {
        width: c.width - cellPadX * 2,
        align: c.align,
      });
    });

    // bottom line
    doc
      .moveTo(tableX, y + headerH)
      .lineTo(tableX + tableW, y + headerH)
      .lineWidth(1)
      .strokeColor(tagColors.border)
      .stroke();

    doc.y = y + headerH;
  }

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const tagColors = pickTagColors(g.reason);
    const items = (g.rows || []).slice().sort((a, b) =>
      String(a?.component || "").localeCompare(String(b?.component || "")),
    );

    const needsTagBar = Boolean(exportTagGroups.length || showReasonTagBarOpt);
    const groupHeaderHeight = (needsTagBar ? tagBarH + 8 : 0) + headerH + 6;
    ensureSpace(groupHeaderHeight);
    const drawGroupHeader = () => {
      if (needsTagBar) drawTagBar(g, items.length, tagColors);
      drawTableHeader(tagColors);
    };
    drawGroupHeader();

    doc.font("Helvetica").fontSize(10).fillColor(COLORS.text);

    items.forEach((r, idx) => {
      const componentLink = normalizeUrl(r.link || r.url || r.componentLink || r.href);
      const rowData = {
        idCode: String(r.idCode || ""),
        component: String(r.component || ""),
        qty: String(Number(r.qty) || 0),
        reason: String(r.reason || ""),
        issue: String(r.issue || r.actualIssueDescription || r.issueDescription || r.reason || ""),
        link: componentLink || String(r.link || r.url || r.componentLink || r.href || ""),
        unit: moneyGBP(r.unit),
        total: moneyGBP(r.total),
      };

      const measuredHeights = columns.map((c) => doc.heightOfString(String(rowData[c.key] || ""), {
        width: Math.max(1, c.width - cellPadX * 2),
        align: c.align,
      }));
      const rowH = Math.max(20, ...measuredHeights) + 8;

      ensureSpace(rowH + 6, { onNewPage: drawGroupHeader });

      const y = doc.y;

      // zebra background
      if (idx % 2 === 0) {
        doc.rect(tableX, y, tableW, rowH).fill(COLORS.zebra);
        doc.fillColor(COLORS.text);
      }

      // grid
      doc.lineWidth(0.6).strokeColor(COLORS.border);
      // left / right borders
      doc.moveTo(tableX, y).lineTo(tableX, y + rowH).stroke();
      doc.moveTo(tableX + tableW, y).lineTo(tableX + tableW, y + rowH).stroke();
      for (let i = 1; i < columns.length; i++) {
        doc.moveTo(columns[i].x, y).lineTo(columns[i].x, y + rowH).stroke();
      }
      // row bottom line
      doc.moveTo(tableX, y + rowH).lineTo(tableX + tableW, y + rowH).stroke();

      // text
      doc.fillColor(COLORS.text).font("Helvetica").fontSize(10);

      columns.forEach((c) => {
        const opts = {
          width: c.width - cellPadX * 2,
          align: c.align,
        };

        // Make component name and URL clickable when a valid URL exists.
        if ((c.key === "component" || c.key === "link") && componentLink) {
          opts.link = componentLink;
        }

        doc.text(String(rowData[c.key] || ""), c.x + cellPadX, y + 6, opts);
      });

      doc.y = y + rowH;
    });

    // space between groups
    doc.y += 14;
  }

  // ======== Totals summary (last page area, above footer) ========
  ensureSpace(90);
  doc.y += 10;

  const { mL: sumML, contentW: sumContentW } = metrics();
  const sumW = 220;
  const sumH = showGrandTotalSummary ? 54 : 34;
  const sumX = sumML + sumContentW - sumW;
  const sumY = doc.y;

  doc.roundedRect(sumX, sumY, sumW, sumH, 10).lineWidth(1).strokeColor(COLORS.border).stroke();

  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9);
  doc.text("Total quantity", sumX + 12, sumY + 10, { width: sumW - 24, align: "left" });
  if (showGrandTotalSummary) {
    doc.text("Grand total", sumX + 12, sumY + 30, { width: sumW - 24, align: "left" });
  }

  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11);
  doc.text(String(Number(grandQty) || 0), sumX + 12, sumY + 8, { width: sumW - 24, align: "right" });
  if (showGrandTotalSummary) {
    doc.text(moneyGBP(grandTotal), sumX + 12, sumY + 28, { width: sumW - 24, align: "right" });
  }

  doc.end();
}

module.exports = {
  pipeDeliveryReceiptPDF,
};
