import "server-only";

import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import deliveryReceiptPdfModule from "./deliveryReceiptPdf";
import { stocktakingReportRows, stocktakingReportGroups, stocktakingReportSummary, stocktakingReportCell } from "./stocktaking-report-layout.mjs";
import { listStocktakingFolders, stocktakingForColumn } from "./stocktaking-data";

const { pipeDeliveryReceiptPDF } = deliveryReceiptPdfModule;

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

// The Operations Orders PDF renderer is the source of truth for page layout,
// grouped tables, instructions, page numbers and per-page signature blocks.
function bufferStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.once("end", () => resolve(Buffer.concat(chunks)));
    stream.once("error", reject);
  });
}

function stockPdfColumns(selectedColumns) {
  const ratios = { stock: 0.12, receiptNumber: 0.21, unityPrice: 0.13, totalPrice: 0.13, inventory: 0.12, defected: 0.12 };
  return [
    { key: "idCode", label: "ID Code", ratio: 0.19, align: "center" },
    { key: "component", label: "Component", ratio: 0.43, align: "left" },
    ...selectedColumns.map((key) => ({
      key, label: COLUMN_DEFS[key].label, ratio: ratios[key] || 0.13,
      align: COLUMN_DEFS[key].align,
    })),
  ];
}

function pdfMoney(value) {
  if (value === "" || value == null) return "";
  const num = Number(value);
  return Number.isFinite(num) ? `EGP ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
}

async function renderPdf({ account, column, inventoryColumn, defectedColumn, columns, instruction, signatureLabels }) {
  const selectedColumns = normalizeColumns(columns);
  const signatures = normalizeSignatureLabels(signatureLabels);
  const exportInstruction = normalizeInstruction(instruction);
  const { items, displayName } = await exportContext(account, column, { inventoryColumn, defectedColumn });
  const rows = stocktakingReportRows(items, selectedColumns);
  const summary = stocktakingReportSummary(rows);
  const pdfRows = rows.map((item) => {
    const out = {
      idCode: stocktakingReportCell(item, "idCode"),
      component: stocktakingReportCell(item, "component"),
      productTag: text(item?.tag?.name) || "Untagged",
      link: /^https?:\/\//i.test(text(item?.url)) ? text(item.url) : "",
    };
    for (const key of selectedColumns) {
      const value = stocktakingReportCell(item, key);
      out[key] = ["unityPrice", "totalPrice"].includes(key) ? pdfMoney(value) : String(value ?? "");
    }
    return out;
  });

  const stream = new PassThrough();
  const resultPromise = bufferStream(stream);
  try {
    await pipeDeliveryReceiptPDF({
      orderId: text(column),
      teamMember: displayName,
      preparedBy: "Stocktaking",
      rows: pdfRows,
      grandQty: summary.quantity,
      grandTotal: summary.stockValue,
      groupMode: "product-tag",
      groupByReason: false,
      showReasonTagBar: false,
      documentTitle: `Stocktaking Report - ${displayName}`,
      summaryTitle: "Stocktaking Summary",
      summaryLabels: { teamMember: "Stock folder", reason: "Report", orderId: "Folder code", date: "Generated" },
      exportColumnDefs: stockPdfColumns(selectedColumns),
      landscape: selectedColumns.length > 3,
      instructionTitle: exportInstruction.title,
      instructionEnglishText: exportInstruction.englishText,
      instructionArabicText: exportInstruction.arabicText,
      signatureLabels: signatures,
    }, stream);
    return {
      buffer: await resultPromise,
      fileName: `Stocktaking-${new Date().toISOString().slice(0, 10)}.pdf`,
      contentType: "application/pdf",
    };
  } catch (error) {
    // Complete the reader promise as well so a PDF stream failure is never silent.
    stream.destroy(error);
    await resultPromise.catch(() => {});
    throw error;
  }
}

function excelColumnName(index) {
  let value = Math.max(1, index); let name = "";
  while (value > 0) { const digit = (value - 1) % 26; name = String.fromCharCode(65 + digit) + name; value = Math.floor((value - 1) / 26); }
  return name;
}

async function renderExcel({ account, column, inventoryColumn, defectedColumn, columns, instruction }) {
  const selectedColumns = normalizeColumns(columns);
  const exportInstruction = normalizeInstruction(instruction);
  const { items, displayName } = await exportContext(account, column, { inventoryColumn, defectedColumn });
  const rows = stocktakingReportRows(items, selectedColumns);
  const groups = stocktakingReportGroups(rows);
  const summary = stocktakingReportSummary(rows);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Operations Hub";
  workbook.created = new Date();
  const ws = workbook.addWorksheet("Stocktaking");
  ws.properties.defaultRowHeight = 18;
  const defs = [
    { key: "idCode", label: "ID Code", width: 17 },
    { key: "component", label: "Component", width: 52 },
    ...selectedColumns.map((key) => ({ key, label: COLUMN_DEFS[key].label, width: key === "receiptNumber" ? 29 : 17 })),
  ];
  defs.forEach((def, i) => { ws.getColumn(i + 1).width = def.width; });
  const lastCol = Math.max(2, defs.length);
  const lastLetter = excelColumnName(lastCol);
  const borderColor = { argb: "FF9CA3AF" };
  const border = {
    top: { style: "thin", color: borderColor },
    bottom: { style: "thin", color: borderColor },
    left: { style: "thin", color: borderColor },
    right: { style: "thin", color: borderColor },
  };
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

  // Exact top-band / metadata hierarchy used by the Operations Orders Excel export.
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `Stocktaking Report - ${displayName}`;
  title.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  title.fill = fill("FF111827");
  title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, lastCol);
  const generated = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" });
  const meta = ws.getCell(2, 1);
  meta.value = `Stock folder: ${displayName}  •  Folder code: ${column}  •  Generated: ${generated}`;
  meta.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
  meta.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(2).height = 22;

  ws.mergeCells("A3:B3");
  const summaryHeader = ws.getCell("A3");
  summaryHeader.value = "Summary";
  summaryHeader.fill = fill("FF1F4E79");
  summaryHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
  summaryHeader.alignment = { horizontal: "center", vertical: "middle" };
  summaryHeader.border = border;
  const summaryRows = [
    ["Total stock items", summary.items],
    ["Total stock quantity", summary.quantity],
    ["Total stock value", summary.stockValue],
  ];
  summaryRows.forEach(([label, value], index) => {
    const row = ws.getRow(4 + index);
    const labelCell = row.getCell(1);
    const valueCell = row.getCell(2);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: "FF111827" } };
    labelCell.fill = fill("FFF3F4F6");
    labelCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    valueCell.value = value;
    valueCell.numFmt = index === 2 ? '"EGP" #,##0.00' : '#,##0.##;-#,##0.##;0';
    valueCell.font = { bold: true, color: { argb: index === 2 ? "FFC2410C" : "FF2563EB" } };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    labelCell.border = border;
    valueCell.border = border;
    row.height = 20;
  });
  ws.addRow([]);

  // Reuse the orders report's separate instructions banner, with RTL support.
  if (exportInstruction.englishText || exportInstruction.arabicText) {
    const heading = text(exportInstruction.title) && text(exportInstruction.title).toLowerCase() !== "instructions" ? text(exportInstruction.title) : "Instructions";
    const headingRow = ws.addRow([heading]);
    ws.mergeCells(`A${headingRow.number}:${lastLetter}${headingRow.number}`);
    headingRow.height = 23;
    headingRow.getCell(1).font = { bold: true, color: { argb: "FFB42318" }, size: 11 };
    headingRow.getCell(1).fill = fill("FFFFF1F2");
    headingRow.getCell(1).alignment = { horizontal: containsArabic(heading) ? "right" : "left", vertical: "middle" };
    headingRow.getCell(1).border = border;
    for (const [value, arabic] of [[exportInstruction.englishText, false], [exportInstruction.arabicText, true]]) {
      if (!value) continue;
      const body = ws.addRow([value]);
      ws.mergeCells(`A${body.number}:${lastLetter}${body.number}`);
      body.height = Math.min(160, Math.max(46, 30 + Math.ceil(value.length / 90) * 15));
      body.getCell(1).alignment = { horizontal: arabic ? "right" : "left", vertical: "top", wrapText: true, readingOrder: arabic ? "rtl" : "ltr" };
      body.getCell(1).fill = fill("FFF8FAFC");
      body.getCell(1).font = { color: { argb: "FF374151" } };
      body.getCell(1).border = border;
    }
    ws.addRow([]);
  }

  const headerIndex = ws.rowCount + 1;
  const header = ws.getRow(headerIndex);
  header.height = 23;
  defs.forEach((def, index) => {
    const cell = header.getCell(index + 1);
    cell.value = def.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = fill("FF374151");
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = border;
  });

  let visualIndex = 0;
  for (const [groupIndex, { tag, items: groupItems }] of groups.entries()) {
    const group = ws.addRow([`${groupIndex + 1}/ ${tag} (${groupItems.length} item${groupItems.length === 1 ? "" : "s"})`]);
    if (lastCol > 1) ws.mergeCells(group.number, 1, group.number, lastCol);
    group.height = 21;
    const groupCell = group.getCell(1);
    groupCell.fill = fill("FFFFF7ED");
    groupCell.font = { bold: true, color: { argb: "FF9A3412" } };
    groupCell.alignment = { horizontal: "left", vertical: "middle" };
    groupCell.border = border;
    for (let i = 2; i <= lastCol; i += 1) {
      group.getCell(i).fill = fill("FFFFF7ED");
      group.getCell(i).border = border;
    }

    for (const item of groupItems) {
      const row = ws.addRow(defs.map((def) => stocktakingReportCell(item, def.key)));
      row.height = Math.min(54, 21 + Math.floor(Math.max(0, text(item?.name).length - 48) / 48) * 14);
      defs.forEach((def, index) => {
        const cell = row.getCell(index + 1);
        cell.border = border;
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        if (visualIndex % 2) cell.fill = fill("FFF9FAFB");
        if (["stock", "inventory", "defected"].includes(def.key)) cell.numFmt = '#,##0.##;-#,##0.##;0';
        if (["unityPrice", "totalPrice"].includes(def.key)) cell.numFmt = '"EGP" #,##0.00';
        if (def.key === "totalPrice") cell.font = { bold: true, color: { argb: "FFC2410C" } };
        if (def.key === "component" && /^https?:\/\//i.test(text(item?.url))) {
          cell.value = { text: text(item?.name) || "-", hyperlink: text(item.url) };
          cell.font = { color: { argb: "FF2563EB" }, underline: true };
        }
      });
      visualIndex += 1;
    }
  }
  if (!rows.length) {
    const emptyRow = ws.addRow(["No components found."]);
    emptyRow.getCell(1).font = { italic: true, color: { argb: "FF6B7280" } };
  }
  ws.views = [{ state: "frozen", ySplit: headerIndex }];
  ws.pageSetup = { paperSize: 9, orientation: defs.length > 5 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerIndex}:${headerIndex}` };
  ws.headerFooter.oddFooter = "Page &P of &N";
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer, fileName: `stocktaking_${new Date().toISOString().slice(0, 10)}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
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
