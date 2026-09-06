const PDFDocument = require("pdfkit");
const path = require("path");
const { attachPageNumbers } = require("./pdfPageNumbers");
const { drawStocktakingHeader } = require("./pdfHeader");
const { enableArabicPdf, ensurePdfArabicSupport, withNativeArabicPdfText } = require("./pdfArabicSupport");

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
      timeZone: "Africa/Cairo",
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

// PDFKit/fontkit shapes Arabic letters correctly, but PDFKit does not perform
// Unicode bidirectional (BiDi) reordering for RTL paragraphs. In native shaping
// mode that means the letters inside each Arabic word look correct while the
// words themselves are laid out left-to-right. Build each visual line in reverse
// word order so reading the rendered line from the right produces the original
// logical Arabic sentence.
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

      return logicalLines
        .map((logicalLine) => logicalLine.slice().reverse().join(" "))
        .join("\n");
    })
    .join("\n");
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
  const generatedAt = new Date();
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
    headerBg: "#F9FAFB",
    tableHeadBg: "#F3F4F6",
    dark: "#050B18",
    link: "#1D4ED8",
  };

  const explicitSignatureLabels = Array.isArray(signatureLabels)
    ? signatureLabels.map((label) => String(label || "").trim()).filter(Boolean)
    : null;
  const INCLUDE_FOOTER_SIGNATURE = showFooterSignature !== false
    && (explicitSignatureLabels === null || explicitSignatureLabels.length > 0);

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
      subtitle: `Order: ${String(orderId || "-")}  •  Generated: ${formatDateTime(generatedAt)}`,
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

    const footerSignatureLabels = explicitSignatureLabels !== null
      ? explicitSignatureLabels.slice()
      : [String(recipientLabelLeft || "Delivered to"), "Operations"];
    if (explicitSignatureLabels === null && String(thirdSignatureLabel || "").trim()) {
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

  // ======== Optional instructions block (page 1, before order metadata) ========
  // One red container holds both languages. English and Arabic stay in separate
  // light-gray inner cards so each language keeps its own text direction.
  const safeInstructionTitle = String(instructionTitle || "").trim();
  const legacyInstruction = splitLegacyInstructionLanguages(instructionText);
  const safeInstructionEnglish = String(instructionEnglishText || legacyInstruction.englishText || "").trim();
  const safeInstructionArabic = String(instructionArabicText || legacyInstruction.arabicText || "").trim();
  const showSelectedTitle = Boolean(safeInstructionTitle && safeInstructionTitle.toLowerCase() !== "instructions");

  const drawInstructionsBlock = () => {
    if (!safeInstructionEnglish && !safeInstructionArabic) return;

    const { mL, contentW } = metrics();
    const outerPadX = 10;
    const outerPadY = 10;
    const innerGap = 8;
    const innerPadX = 11;
    const innerPadY = 9;
    const titleSize = 10.5;
    const bodySize = 9;
    const paragraphGap = 7;
    const innerW = Math.max(1, contentW - outerPadX * 2);
    const bodyTextW = Math.max(1, innerW - innerPadX * 2);
    const titleText = showSelectedTitle ? safeInstructionTitle : "Instructions";

    const prepareBodyLayout = (value, isArabic = false) => {
      const paragraphs = splitInstructionParagraphs(value);
      const build = () => {
        doc.font("Helvetica").fontSize(bodySize);
        const displayParagraphs = paragraphs.map((paragraph) =>
          isArabic ? prepareNativeRtlPdfText(doc, paragraph, bodyTextW) : paragraph,
        );
        const heights = displayParagraphs.map((paragraph) =>
          doc.heightOfString(paragraph, {
            width: bodyTextW,
            lineGap: 2,
            align: isArabic ? "right" : "left",
          }),
        );
        const contentH = heights.reduce((sum, height) => sum + height, 0)
          + Math.max(0, heights.length - 1) * paragraphGap;
        return {
          displayParagraphs,
          heights,
          height: Math.max(42, innerPadY * 2 + contentH),
        };
      };
      return isArabic ? withNativeArabicPdfText(doc, build) : build();
    };

    const englishLayout = safeInstructionEnglish ? prepareBodyLayout(safeInstructionEnglish, false) : null;
    const arabicLayout = safeInstructionArabic ? prepareBodyLayout(safeInstructionArabic, true) : null;

    const titleIsArabic = containsArabicText(titleText);
    const prepareTitle = () => {
      doc.font("Helvetica-Bold").fontSize(titleSize);
      const displayTitle = titleIsArabic
        ? prepareNativeRtlPdfText(doc, titleText, innerW)
        : titleText;
      return {
        displayTitle,
        height: doc.heightOfString(displayTitle, { width: innerW, lineGap: 1, align: "left" }),
      };
    };
    const titleLayout = titleIsArabic ? withNativeArabicPdfText(doc, prepareTitle) : prepareTitle();

    const innerLayouts = [englishLayout, arabicLayout].filter(Boolean);
    const contentBlocksH = innerLayouts.reduce((sum, layout) => sum + layout.height, 0)
      + Math.max(0, innerLayouts.length - 1) * innerGap;
    const outerH = outerPadY + titleLayout.height + 8 + contentBlocksH + outerPadY;

    ensureSpace(outerH + 12);
    const y = doc.y;
    doc.save();
    doc.roundedRect(mL, y, contentW, outerH, 10).fillAndStroke("#FFF1F2", "#F87171");

    const drawTitle = () => {
      doc.fillColor("#B42318").font("Helvetica-Bold").fontSize(titleSize).text(
        titleLayout.displayTitle,
        mL + outerPadX,
        y + outerPadY,
        { width: innerW, lineGap: 1, align: "left" },
      );
    };
    if (titleIsArabic) withNativeArabicPdfText(doc, drawTitle);
    else drawTitle();

    let cursorY = y + outerPadY + titleLayout.height + 8;

    const drawLanguageCard = (layout, isArabic = false) => {
      if (!layout) return;
      doc.roundedRect(mL + outerPadX, cursorY, innerW, layout.height, 8)
        .fillAndStroke("#F8FAFC", "#E5E7EB");

      let textY = cursorY + innerPadY;
      const renderText = () => {
        layout.displayParagraphs.forEach((paragraph, index) => {
          doc.fillColor(COLORS.text).font("Helvetica").fontSize(bodySize).text(
            paragraph,
            mL + outerPadX + innerPadX,
            textY,
            {
              width: bodyTextW,
              lineGap: 2,
              align: isArabic ? "right" : "left",
            },
          );
          textY += layout.heights[index] || 0;
          if (index < layout.displayParagraphs.length - 1) textY += paragraphGap;
        });
      };
      if (isArabic) withNativeArabicPdfText(doc, renderText);
      else renderText();
      cursorY += layout.height + innerGap;
    };

    drawLanguageCard(englishLayout, false);
    drawLanguageCard(arabicLayout, true);

    doc.restore();
    doc.y = y + outerH + 10;
  };

  drawInstructionsBlock();

  // ======== Proposal-style order summary (page 1) ========
  const { pageW, pageH, mL, mR, mB, contentW } = metrics();

  ensureSpace(128);
  // Give the section heading equal breathing room above and below so it sits
  // visually centered between the previous block/header and the info cards.
  doc.y += 5;
  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("Order Summary", mL, doc.y);
  doc.moveDown(0.45);

  const infoGap = 12;
  const infoW = (contentW - infoGap) / 2;
  const infoH = 38;
  const infoPadX = 10;
  const drawInfoBox = (x, y, title, value) => {
    doc.roundedRect(x, y, infoW, infoH, 8).fillColor(COLORS.headerBg).fill();
    doc.roundedRect(x, y, infoW, infoH, 8).lineWidth(0.8).strokeColor(COLORS.border).stroke();
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8.5).text(String(title || ""), x + infoPadX, y + 6, {
      width: infoW - infoPadX * 2,
      align: "left",
    });
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10).text(String(value || "—"), x + infoPadX, y + 20, {
      width: infoW - infoPadX * 2,
      align: "left",
      ellipsis: true,
    });
  };

  const infoY1 = doc.y;
  const teamLabel = String(teamMember || "—");
  const reasonLabel = String(preparedBy || "—");
  drawInfoBox(mL, infoY1, "Team member", teamLabel);
  drawInfoBox(mL + infoW + infoGap, infoY1, "Reason", reasonLabel);
  const infoY2 = infoY1 + infoH + 8;
  drawInfoBox(mL, infoY2, "Order ID", String(orderId || "—"));
  drawInfoBox(mL + infoW + infoGap, infoY2, "Date", formatDateTime(generatedAt));
  doc.y = infoY2 + infoH + 16;

  // Keep the proposal-style summary compact. The three dark statistic cards
  // (Component rows / Total quantity / Groups) were intentionally removed so
  // the component table starts immediately after the order information.
  doc.y += 2;

  // ======== Proposal-style component tables ========
  const tableX = mL;
  const tableW = contentW;
  const headerH = 24;
  const cellPadX = 7;

  const allColumnDefs = [
    { key: "idCode", label: "ID Code", ratio: 0.16, align: "left" },
    { key: "component", label: "Component", ratio: 0.38, align: "left" },
    { key: "qty", label: "Quantity", ratio: 0.10, align: "right" },
    { key: "reason", label: "Reason", ratio: 0.20, align: "left" },
    { key: "issue", label: "Issue", ratio: 0.22, align: "left" },
    { key: "link", label: "Component link", ratio: 0.26, align: "left" },
    { key: "unit", label: "Unit Cost", ratio: 0.12, align: "right" },
    { key: "total", label: "Total Cost", ratio: 0.13, align: "right" },
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

  function drawTableHeader() {
    const y = doc.y;
    doc.rect(tableX, y, tableW, headerH).fillColor(COLORS.tableHeadBg).fill();
    doc.rect(tableX, y, tableW, headerH).lineWidth(0.8).strokeColor(COLORS.border).stroke();

    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.5);
    columns.forEach((c, index) => {
      doc.text(c.label, c.x + cellPadX, y + 7, {
        width: c.width - cellPadX * 2,
        align: c.align,
      });
      if (index > 0) {
        doc.moveTo(c.x, y).lineTo(c.x, y + headerH).lineWidth(0.5).strokeColor(COLORS.border).stroke();
      }
    });
    doc.y = y + headerH;
  }

  function drawFolderHeader(folderName, kitCount = 0) {
    const y = doc.y;
    doc.rect(tableX, y, tableW, 27).fillColor("#07101F").fill();
    doc.rect(tableX, y, tableW, 27).lineWidth(0.5).strokeColor("#1F2937").stroke();
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(10).text(String(folderName || "Unfiled Kits"), tableX + cellPadX, y + 8, {
      width: tableW - 125,
      align: "left",
      ellipsis: true,
    });
    doc.fillColor("#CBD5E1").font("Helvetica-Bold").fontSize(8).text(`${Number(kitCount) || 0} kit${Number(kitCount) === 1 ? "" : "s"}`, tableX + tableW - 110, y + 9, {
      width: 103,
      align: "right",
    });
    doc.y = y + 27;
  }

  function drawKitHeader(kitName, count = 0) {
    const y = doc.y;
    doc.rect(tableX, y, tableW, 24).fillColor("#FFF7ED").fill();
    doc.rect(tableX, y, tableW, 24).lineWidth(0.5).strokeColor("#FED7AA").stroke();
    doc.fillColor("#9A3412").font("Helvetica-Bold").fontSize(9.3).text(String(kitName || "Unassigned kit"), tableX + cellPadX, y + 7, {
      width: tableW - 110,
      align: "left",
      ellipsis: true,
    });
    doc.fillColor("#C2410C").font("Helvetica-Bold").fontSize(8).text(`${Number(count) || 0} item${Number(count) === 1 ? "" : "s"}`, tableX + tableW - 100, y + 8, {
      width: 93,
      align: "right",
    });
    doc.y = y + 24;
  }

  function drawTagHeader(tag, count = 0) {
    const y = doc.y;
    doc.rect(tableX, y, tableW, 24).fillColor("#FFF7ED").fill();
    doc.rect(tableX, y, tableW, 24).lineWidth(0.5).strokeColor("#FED7AA").stroke();
    doc.fillColor("#9A3412").font("Helvetica-Bold").fontSize(9.3).text(String(tag || "Uncategorized"), tableX + cellPadX, y + 7, {
      width: tableW - 110,
      align: "left",
      ellipsis: true,
    });
    doc.fillColor("#C2410C").font("Helvetica-Bold").fontSize(8).text(`${Number(count) || 0} item${Number(count) === 1 ? "" : "s"}`, tableX + tableW - 100, y + 8, {
      width: 93,
      align: "right",
    });
    doc.y = y + 24;
  }

  function drawReasonHeader(reason, count = 0) {
    const y = doc.y;
    doc.rect(tableX, y, tableW, 24).fillColor("#F5F3FF").fill();
    doc.rect(tableX, y, tableW, 24).lineWidth(0.5).strokeColor("#DDD6FE").stroke();
    doc.fillColor("#5B21B6").font("Helvetica-Bold").fontSize(9.3).text(String(reason || "No Reason"), tableX + cellPadX, y + 7, {
      width: tableW - 110,
      align: "left",
      ellipsis: true,
    });
    doc.fillColor("#6D28D9").font("Helvetica-Bold").fontSize(8).text(`${Number(count) || 0} item${Number(count) === 1 ? "" : "s"}`, tableX + tableW - 100, y + 8, {
      width: 93,
      align: "right",
    });
    doc.y = y + 24;
  }

  function drawItemRow(r, visualIndex = 0, repeatHeader = null) {
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

    doc.font("Helvetica").fontSize(9);
    const measuredHeights = columns.map((c) => doc.heightOfString(String(rowData[c.key] || ""), {
      width: Math.max(1, c.width - cellPadX * 2),
      align: c.align,
      lineGap: 1,
    }));
    const rowH = Math.max(20, ...measuredHeights) + 8;
    ensureSpace(rowH + 4, { onNewPage: repeatHeader });

    const y = doc.y;
    if (visualIndex % 2 === 1) doc.rect(tableX, y, tableW, rowH).fillColor(COLORS.zebra).fill();

    doc.rect(tableX, y, tableW, rowH).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    columns.forEach((c, index) => {
      if (index > 0) doc.moveTo(c.x, y).lineTo(c.x, y + rowH).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    });

    doc.fillColor(COLORS.text).font("Helvetica").fontSize(9);
    columns.forEach((c) => {
      const opts = {
        width: c.width - cellPadX * 2,
        align: c.align,
        lineGap: 1,
      };
      if ((c.key === "component" || c.key === "link") && componentLink) opts.link = componentLink;
      doc.text(String(rowData[c.key] || ""), c.x + cellPadX, y + 6, opts);
    });
    doc.y = y + rowH;
  }

  let visualIndex = 0;

  if (exportGroupMode === "kit-tag" && exportTagGroups.length) {
    const folderGroups = new Map();
    for (const group of exportTagGroups) {
      const folderName = String(group?.folderName || "Unfiled Kits").trim() || "Unfiled Kits";
      if (!folderGroups.has(folderName)) folderGroups.set(folderName, []);
      folderGroups.get(folderName).push(group);
    }

    for (const [folderName, kitGroups] of folderGroups.entries()) {
      ensureSpace(58);
      drawFolderHeader(folderName, kitGroups.length);
      for (const group of kitGroups) {
        const items = (group.rows || []).slice().sort((a, b) => naturalCompare(a?.component, b?.component));
        const repeatHeader = () => {
          drawFolderHeader(folderName, kitGroups.length);
          drawKitHeader(group.tag || "Unassigned kit", items.length);
          drawTableHeader();
        };
        ensureSpace(24 + headerH + 8);
        drawKitHeader(group.tag || "Unassigned kit", items.length);
        drawTableHeader();
        items.forEach((row) => {
          drawItemRow(row, visualIndex, repeatHeader);
          visualIndex += 1;
        });
        doc.y += 10;
      }
      doc.y += 4;
    }
  } else if (exportGroupMode === "product-tag" && exportTagGroups.length) {
    for (const group of exportTagGroups) {
      const items = (group.rows || []).slice().sort((a, b) => naturalCompare(a?.component, b?.component));
      const repeatHeader = () => {
        drawTagHeader(group.tag || "Uncategorized", items.length);
        drawTableHeader();
      };
      ensureSpace(24 + headerH + 8);
      drawTagHeader(group.tag || "Uncategorized", items.length);
      drawTableHeader();
      items.forEach((row) => {
        drawItemRow(row, visualIndex, repeatHeader);
        visualIndex += 1;
      });
      doc.y += 12;
    }
  } else {
    for (const group of groups) {
      const items = (group.rows || []).slice().sort((a, b) => naturalCompare(a?.component, b?.component));
      const repeatHeader = () => {
        if (showReasonTagBarOpt || groupByReasonOpt) drawReasonHeader(group.reason || "No Reason", items.length);
        drawTableHeader();
      };
      ensureSpace((showReasonTagBarOpt || groupByReasonOpt ? 24 : 0) + headerH + 8);
      if (showReasonTagBarOpt || groupByReasonOpt) drawReasonHeader(group.reason || "No Reason", items.length);
      drawTableHeader();
      items.forEach((row) => {
        drawItemRow(row, visualIndex, repeatHeader);
        visualIndex += 1;
      });
      doc.y += 12;
    }
  }

  doc.end();
}

module.exports = {
  pipeDeliveryReceiptPDF,
};
