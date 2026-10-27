import "server-only";

import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import pdfPageNumbersModule from "./pdfPageNumbers";
import pdfHeaderModule from "./pdfHeader";
import pdfArabicSupportModule from "./pdfArabicSupport";
import { listStocktakingFolders, stocktakingForColumn } from "./stocktaking-data";

const { attachPageNumbers } = pdfPageNumbersModule;
const { drawStocktakingHeader } = pdfHeaderModule;
const { enableArabicPdf, ensurePdfArabicSupport } = pdfArabicSupportModule;

const COLUMN_DEFS = {
  stock: { label: "Stock", width: 58, align: "right" },
  receiptNumber: { label: "Receipt number", width: 92, align: "left" },
  unityPrice: { label: "Unity price", width: 72, align: "right" },
  totalPrice: { label: "Total price", width: 78, align: "right" },
  inventory: { label: "Inventory", width: 66, align: "right" },
  defected: { label: "Defected", width: 66, align: "right" },
};
const DEFAULT_COLUMNS = ["stock", "unityPrice", "totalPrice"];
const DEFAULT_SIGNATURES = ["Storekeeper", "Operations", "Delivered to"];

function text(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function containsArabic(value) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(String(value || ""));
}

function normalizeColumns(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  const selected = [...new Set(source.map(text).filter((key) => Object.prototype.hasOwnProperty.call(COLUMN_DEFS, key)))];
  return selected.length ? selected : [...DEFAULT_COLUMNS];
}

function normalizeSignatureLabels(value) {
  if (!Array.isArray(value)) return [...DEFAULT_SIGNATURES];
  const selected = [...new Set(value.map(text).filter(Boolean).slice(0, 6))];
  return selected;
}

function splitInstructionText(value) {
  const raw = String(value || "").replace(/\r\n?/g, "\n").trim();
  if (!raw) return { englishText: "", arabicText: "" };
  const english = [];
  const arabic = [];
  const blocks = raw.split(/\n[ \t]*\n+/).map(text).filter(Boolean);
  for (const block of blocks.length ? blocks : [raw]) (containsArabic(block) ? arabic : english).push(block);
  return { englishText: english.join("\n\n"), arabicText: arabic.join("\n\n") };
}

function normalizeInstruction(value) {
  if (!value) return { title: "", englishText: "", arabicText: "" };
  if (typeof value === "string") {
    const split = splitInstructionText(value.slice(0, 4000));
    return { title: (split.englishText || split.arabicText) ? "Instructions" : "", englishText: split.englishText.slice(0, 2000), arabicText: split.arabicText.slice(0, 2000) };
  }
  const split = splitInstructionText(value?.text || value?.body || "");
  const englishText = text(value?.englishText || value?.english || split.englishText).slice(0, 2000);
  const arabicText = text(value?.arabicText || value?.arabic || split.arabicText).slice(0, 2000);
  return {
    title: (englishText || arabicText) ? text(value?.title || "Instructions").slice(0, 120) : "",
    englishText,
    arabicText,
  };
}

function moneyValue(value) {
  if (value === null || typeof value === "undefined" || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function totalPrice(quantity, unitPrice) {
  const price = moneyValue(unitPrice);
  return price === null ? null : (Number(quantity) || 0) * price;
}

function moneyText(value) {
  const parsed = moneyValue(value);
  return parsed === null ? "" : `${parsed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
}

function receiptNumbersInline(value) {
  return String(value || "").replace(/\r\n?/g, "\n").split(/[\n,]+/).map(text).filter(Boolean).join(", ");
}

function tagTone(name = "", fallback = "default") {
  const token = text(name).toLowerCase();
  const color = token.includes("request") ? "green" : (token.includes("withdraw") ? "red" : fallback);
  const tones = {
    green: { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46" },
    red: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" },
    orange: { bg: "#FFF7ED", border: "#FED7AA", text: "#9A3412" },
    blue: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" },
    purple: { bg: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6" },
    default: { bg: "#F3F4F6", border: "#E5E7EB", text: "#374151" },
  };
  return tones[color] || tones.default;
}

function collectPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });
}

function exportValue(item, key) {
  const quantity = Number(item?.quantity) || 0;
  if (key === "stock") return String(quantity);
  if (key === "receiptNumber") return receiptNumbersInline(item?.receiptNumber);
  if (key === "unityPrice") return moneyText(item?.unitPrice);
  if (key === "totalPrice") return moneyText(totalPrice(quantity, item?.unitPrice));
  if (key === "inventory") return item?.inventory === null || typeof item?.inventory === "undefined" ? "" : String(Number(item.inventory));
  if (key === "defected") return item?.defected === null || typeof item?.defected === "undefined" ? "" : String(Number(item.defected));
  return "";
}

async function exportContext(account, column, { inventoryColumn = "", defectedColumn = "", fresh = true } = {}) {
  const [items, folders] = await Promise.all([
    stocktakingForColumn(column, { inventoryColumn, defectedColumn, fresh }),
    listStocktakingFolders({ account, fresh: false }).catch(() => []),
  ]);
  const folder = (folders || []).find((item) => text(item?.key) === text(column)) || null;
  return {
    items: Array.isArray(items) ? items : [],
    displayName: text(folder?.label || account?.name || account?.username || column) || "Stocktaking",
  };
}

async function renderPdf({ account, column, inventoryColumn, defectedColumn, columns, instruction, signatureLabels }) {
  const selectedColumns = normalizeColumns(columns);
  const signatures = normalizeSignatureLabels(signatureLabels);
  const exportInstruction = normalizeInstruction(instruction);
  const { items, displayName } = await exportContext(account, column, { inventoryColumn, defectedColumn });
  const rows = items.filter((item) => {
    const q = Number(item?.quantity);
    const inv = Number(item?.inventory);
    const defected = Number(item?.defected);
    return (Number.isFinite(q) && q !== 0)
      || (selectedColumns.includes("inventory") && item?.inventory !== null && Number.isFinite(inv))
      || (selectedColumns.includes("defected") && item?.defected !== null && Number.isFinite(defected));
  });

  await ensurePdfArabicSupport();
  const doc = new PDFDocument({ size: "A4", layout: selectedColumns.length > 4 ? "landscape" : "portrait", margin: 36, bufferPages: true });
  enableArabicPdf(doc);
  const bufferPromise = collectPdfBuffer(doc);
  attachPageNumbers(doc);

  const COLORS = { text: "#111827", muted: "#6B7280", border: "#E5E7EB", headerBg: "#F9FAFB" };
  const now = new Date();
  const generated = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  drawStocktakingHeader(doc, { title: "Stocktaking", subtitle: `Name: ${displayName} • Date: ${generated}`, colors: COLORS });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const contentW = right - left;
  const bottom = doc.page.height - doc.page.margins.bottom - 18;

  const instructionBlock = (label, body, isArabic = false) => {
    if (!text(body)) return;
    doc.font("Helvetica").fontSize(9);
    const innerW = contentW - 24;
    const customTitle = text(exportInstruction.title);
    const showTitle = customTitle && customTitle.toLowerCase() !== "instructions" && containsArabic(customTitle) === isArabic;
    const titleH = showTitle ? doc.font("Helvetica-Bold").fontSize(9.5).heightOfString(customTitle, { width: innerW, align: isArabic ? "right" : "left" }) : 0;
    const bodyH = doc.font("Helvetica").fontSize(9).heightOfString(body, { width: innerW, align: isArabic ? "right" : "left", lineGap: 2 });
    const h = Math.max(54, bodyH + 34 + (showTitle ? titleH + 6 : 0));
    if (doc.y + h > bottom) doc.addPage();
    const y = doc.y;
    doc.roundedRect(left, y, contentW, h, 8).fillAndStroke(isArabic ? "#F7FFFD" : "#FFFCF7", isArabic ? "#99F6E4" : "#FED7AA");
    doc.fillColor(isArabic ? "#0F766E" : "#9A3412").font("Helvetica-Bold").fontSize(10).text(label, left + 12, y + 10, { width: innerW, align: isArabic ? "right" : "left" });
    let cursor = y + 27;
    if (showTitle) {
      doc.fillColor(isArabic ? "#0F766E" : "#B45309").font("Helvetica-Bold").fontSize(9.5).text(customTitle, left + 12, cursor, { width: innerW, align: isArabic ? "right" : "left" });
      cursor += titleH + 6;
    }
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(9).text(body, left + 12, cursor, { width: innerW, align: isArabic ? "right" : "left", lineGap: 2 });
    doc.y = y + h + 8;
  };
  instructionBlock("English Instructions", exportInstruction.englishText, false);
  instructionBlock("التعليمات العربية", exportInstruction.arabicText, true);

  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(13).text("Handover Confirmation", left, doc.y);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text("I hereby confirm receiving the below items in good condition. Any discrepancies were noted at delivery.", left, doc.y + 3, { width: contentW });
  doc.moveDown(1.1);

  const infoY = doc.y;
  const gap = 12;
  const infoW = (contentW - gap) / 2;
  const drawInfo = (x, label, value) => {
    doc.roundedRect(x, infoY, infoW, 34, 8).fillAndStroke(COLORS.headerBg, COLORS.border);
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(label, x + 10, infoY + 6);
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(9).text(value || "-", x + 10, infoY + 18, { width: infoW - 20 });
  };
  drawInfo(left, "Name", displayName);
  drawInfo(left + infoW + gap, "Date", generated);
  doc.y = infoY + 48;

  const groups = new Map();
  for (const item of rows) {
    const tag = text(item?.tag?.name) || "Untagged";
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(item);
  }
  const tagGroups = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (!tagGroups.length) {
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(11).text("No stock data found.", left, doc.y);
  } else {
    const fixedIdW = 72;
    const extraDefs = selectedColumns.map((key) => ({ key, ...COLUMN_DEFS[key] }));
    const fixedExtraW = extraDefs.reduce((sum, item) => sum + item.width, 0);
    const componentW = Math.max(150, contentW - fixedIdW - fixedExtraW);
    const tableW = fixedIdW + componentW + fixedExtraW;
    const tableLeft = left + Math.max(0, (contentW - tableW) / 2);

    const ensureSpace = (height, redraw = null) => {
      if (doc.y + height <= bottom) return;
      doc.addPage();
      if (redraw) redraw();
    };

    for (const [tag, groupItems] of tagGroups) {
      const tone = tagTone(tag, text(groupItems[0]?.tag?.color));
      const drawHeader = () => {
        const y = doc.y;
        doc.roundedRect(tableLeft, y, tableW, 22, 8).fillAndStroke(tone.bg, tone.border);
        doc.fillColor(tone.text).font("Helvetica-Bold").fontSize(9).text(`Tag  ${tag}`, tableLeft + 10, y + 7, { width: tableW - 95 });
        doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8).text(`${groupItems.length} items`, tableLeft + tableW - 80, y + 7, { width: 70, align: "right" });
        doc.y = y + 28;
        const hy = doc.y;
        doc.rect(tableLeft, hy, tableW, 22).fill(tone.bg).stroke(tone.border);
        doc.fillColor(tone.text).font("Helvetica-Bold").fontSize(8);
        let x = tableLeft;
        doc.text("ID Code", x + 5, hy + 7, { width: fixedIdW - 10 }); x += fixedIdW;
        doc.text("Component", x + 5, hy + 7, { width: componentW - 10 }); x += componentW;
        for (const def of extraDefs) { doc.text(def.label, x + 4, hy + 7, { width: def.width - 8, align: def.align }); x += def.width; }
        doc.y = hy + 22;
      };
      ensureSpace(60);
      drawHeader();

      const sorted = groupItems.slice().sort((a, b) => text(a?.name).localeCompare(text(b?.name)));
      for (const item of sorted) {
        doc.font("Helvetica").fontSize(8);
        const componentH = doc.heightOfString(text(item?.name) || "-", { width: componentW - 10 });
        const otherH = Math.max(0, ...extraDefs.map((def) => doc.heightOfString(exportValue(item, def.key), { width: def.width - 8 })));
        const rowH = Math.max(22, componentH + 10, otherH + 10);
        ensureSpace(rowH + 4, drawHeader);
        const y = doc.y;
        doc.rect(tableLeft, y, tableW, rowH).strokeColor(COLORS.border).lineWidth(0.6).stroke();
        let x = tableLeft;
        doc.fillColor(COLORS.text).text(text(item?.idCode), x + 5, y + 6, { width: fixedIdW - 10 }); x += fixedIdW;
        const componentOptions = { width: componentW - 10 };
        if (text(item?.url)) { componentOptions.link = text(item.url); componentOptions.underline = true; doc.fillColor("#1D4ED8"); }
        doc.text(text(item?.name) || "-", x + 5, y + 6, componentOptions); x += componentW;
        doc.fillColor(COLORS.text);
        for (const def of extraDefs) {
          doc.moveTo(x, y).lineTo(x, y + rowH).strokeColor(COLORS.border).stroke();
          doc.text(exportValue(item, def.key), x + 4, y + 6, { width: def.width - 8, align: def.align });
          x += def.width;
        }
        doc.y = y + rowH;
      }
      doc.y += 12;
    }
  }

  if (signatures.length) {
    const needed = 105;
    if (doc.y + needed > bottom) doc.addPage();
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(11).text("Handover confirmation", left, doc.y, { width: contentW });
    doc.y += 18;
    const signatureGap = 10;
    const boxW = (contentW - signatureGap * Math.max(0, signatures.length - 1)) / signatures.length;
    const y = doc.y;
    signatures.forEach((label, index) => {
      const x = left + index * (boxW + signatureGap);
      doc.roundedRect(x, y, boxW, 76, 8).strokeColor(COLORS.border).stroke();
      doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(8.5).text(label, x + 9, y + 9, { width: boxW - 18 });
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text("Name", x + 9, y + 33);
      doc.moveTo(x + 42, y + 43).lineTo(x + boxW - 9, y + 43).strokeColor(COLORS.border).stroke();
      doc.text("Signature", x + 9, y + 55);
      doc.moveTo(x + 54, y + 65).lineTo(x + boxW - 9, y + 65).strokeColor(COLORS.border).stroke();
    });
  }

  doc.end();
  const buffer = await bufferPromise;
  return { buffer, fileName: `Stocktaking-${now.toISOString().slice(0, 10)}.pdf`, contentType: "application/pdf" };
}

async function renderExcel({ account, column, inventoryColumn, defectedColumn, columns, instruction }) {
  const selectedColumns = normalizeColumns(columns);
  const exportInstruction = normalizeInstruction(instruction);
  const { items } = await exportContext(account, column, { inventoryColumn, defectedColumn });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Operations Hub";
  workbook.created = new Date();
  const ws = workbook.addWorksheet("Stocktaking");

  const labels = ["Tag", "ID Code", "Component", ...selectedColumns.map((key) => COLUMN_DEFS[key].label)];
  const keys = ["tag", "idCode", "name", ...selectedColumns];
  const widths = { tag: 24, idCode: 18, name: 52, stock: 12, receiptNumber: 26, unityPrice: 14, totalPrice: 14, inventory: 14, defected: 14 };
  ws.columns = keys.map((key) => ({ key, width: widths[key] || 14 }));

  const colLetter = (index) => {
    let n = Math.max(1, index); let out = "";
    while (n > 0) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); }
    return out;
  };
  const lastCol = colLetter(labels.length);
  const selectedInstructionTitle = text(exportInstruction.title);
  if (selectedInstructionTitle && selectedInstructionTitle.toLowerCase() !== "instructions") {
    const titleRow = ws.addRow([selectedInstructionTitle]);
    ws.mergeCells(`A${titleRow.number}:${lastCol}${titleRow.number}`);
    const titleIsArabic = containsArabic(selectedInstructionTitle);
    titleRow.getCell(1).font = { bold: true, color: { argb: "FFB45309" } };
    titleRow.getCell(1).alignment = { horizontal: titleIsArabic ? "right" : "left", readingOrder: titleIsArabic ? "rtl" : "ltr" };
  }
  const addInstruction = (label, value, isArabic) => {
    if (!text(value)) return;
    const labelRow = ws.addRow([label]); ws.mergeCells(`A${labelRow.number}:${lastCol}${labelRow.number}`);
    labelRow.getCell(1).font = { bold: true, color: { argb: isArabic ? "FF0F766E" : "FF9A3412" } };
    labelRow.getCell(1).alignment = { horizontal: isArabic ? "right" : "left", readingOrder: isArabic ? "rtl" : "ltr" };
    const bodyRow = ws.addRow([text(value)]); ws.mergeCells(`A${bodyRow.number}:${lastCol}${bodyRow.number}`);
    bodyRow.height = Math.min(140, Math.max(40, 24 + Math.ceil(text(value).length / 90) * 15));
    bodyRow.getCell(1).alignment = { horizontal: isArabic ? "right" : "left", vertical: "top", wrapText: true, readingOrder: isArabic ? "rtl" : "ltr" };
    ws.addRow([]);
  };
  addInstruction("English Instructions", exportInstruction.englishText, false);
  addInstruction("التعليمات العربية", exportInstruction.arabicText, true);

  const header = ws.addRow(labels);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    cell.border = { top: { style: "thin", color: { argb: "FFE5E7EB" } }, bottom: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } }, right: { style: "thin", color: { argb: "FFE5E7EB" } } };
  });
  ws.views = [{ state: "frozen", ySplit: header.number }];

  const sorted = items.filter((item) => Number(item?.quantity) !== 0 || (selectedColumns.includes("inventory") && item?.inventory !== null) || (selectedColumns.includes("defected") && item?.defected !== null))
    .slice().sort((a, b) => text(a?.tag?.name).localeCompare(text(b?.tag?.name)) || text(a?.name).localeCompare(text(b?.name)));
  for (const item of sorted) {
    const rowPayload = { tag: text(item?.tag?.name) || "Untagged", idCode: text(item?.idCode), name: text(item?.name) };
    for (const key of selectedColumns) {
      if (key === "stock") rowPayload[key] = Number(item?.quantity) || 0;
      else if (key === "receiptNumber") rowPayload[key] = receiptNumbersInline(item?.receiptNumber);
      else if (key === "unityPrice") rowPayload[key] = moneyValue(item?.unitPrice) ?? "";
      else if (key === "totalPrice") rowPayload[key] = totalPrice(item?.quantity, item?.unitPrice) ?? "";
      else if (key === "inventory") rowPayload[key] = item?.inventory === null || typeof item?.inventory === "undefined" ? "" : Number(item.inventory);
      else if (key === "defected") rowPayload[key] = item?.defected === null || typeof item?.defected === "undefined" ? "" : Number(item.defected);
    }
    const row = ws.addRow(rowPayload);
    if (text(item?.url)) {
      const cell = row.getCell("name");
      cell.value = { text: text(item?.name), hyperlink: text(item.url) };
      cell.font = { color: { argb: "FF1D4ED8" }, underline: true };
    }
  }
  for (const key of ["unityPrice", "totalPrice"]) if (selectedColumns.includes(key)) ws.getColumn(key).numFmt = '"EGP" #,##0.00';

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const date = new Date().toISOString().slice(0, 10);
  return { buffer, fileName: `stocktaking_${date}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

export async function renderStocktakingExport({
  account = {},
  kind = "pdf",
  column = "",
  inventoryColumn = "",
  defectedColumn = "",
  columns = null,
  instruction = null,
  signatureLabels = null,
} = {}) {
  const cleanKind = text(kind).toLowerCase();
  if (!text(column)) {
    const error = new Error("A Stocktaking folder is required for export.");
    error.status = 400;
    throw error;
  }
  const args = { account, column, inventoryColumn, defectedColumn, columns, instruction, signatureLabels };
  if (cleanKind === "excel") return await renderExcel(args);
  return await renderPdf(args);
}

export const __stocktakingExportTest = { normalizeColumns, normalizeInstruction, normalizeSignatureLabels };
