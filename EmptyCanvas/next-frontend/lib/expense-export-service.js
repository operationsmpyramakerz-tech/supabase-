import "server-only";

import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import pdfPageNumbersModule from "./pdfPageNumbers";
import pdfHeaderModule from "./pdfHeader";
import pdfArabicSupportModule from "./pdfArabicSupport";

const { attachPageNumbers } = pdfPageNumbersModule;
const { drawStocktakingHeader } = pdfHeaderModule;
const { enableArabicPdf, ensurePdfArabicSupport } = pdfArabicSupportModule;

function text(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeExportName(value = "expenses") {
  return String(value || "expenses")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-z0-9\- _]/gi, "_")
    .slice(0, 120) || "expenses";
}

function safeItems(items) {
  return Array.isArray(items) ? items.filter((item) => item && typeof item === "object") : [];
}

function displayUserName(value) {
  const raw = text(value || "Expenses");
  return raw.replace(/^Expenses\s*[—\-]\s*/i, "").trim() || raw || "Expenses";
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "-";
  const raw = text(dateStr);
  if (/^\d{2} [A-Za-z]{3} \d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function expenseScreenshotEntries(item = {}) {
  const shots = Array.isArray(item?.screenshots) ? item.screenshots : [];
  const normalized = shots
    .map((shot, index) => ({
      name: text(shot?.name || shot?.filename || shot?.fileName) || `Screenshot ${index + 1}`,
      url: text(shot?.url || shot?.href || shot?.publicUrl || shot?.public_url || shot?.signedUrl || shot?.signedURL || shot?.downloadUrl || shot?.downloadURL),
    }))
    .filter((shot) => shot.url);
  if (normalized.length) return normalized;

  const fallbackUrl = text(item?.screenshotUrl || item?.screenshot_url);
  if (!fallbackUrl) return [];
  return [{
    name: text(item?.screenshotName || item?.screenshot_name) || "Screenshot",
    url: fallbackUrl,
  }];
}

function absoluteAppUrl(baseUrl, value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const root = text(baseUrl).replace(/\/+$/, "");
  if (!root) return raw;
  return `${root}/${raw.replace(/^\/+/, "")}`;
}

function expenseReasonExportPayload(item = {}, baseUrl = "") {
  const orders = Array.isArray(item?.orders) ? item.orders.filter(Boolean) : [];
  const fallbackText = text(item?.reason);
  if (!orders.length) return { text: fallbackText, hyperlink: "" };

  const orderIds = Array.from(new Set(orders.map((order) => text(order?.orderId)).filter(Boolean)));
  const relationIds = Array.from(new Set(
    orders.flatMap((order) => Array.isArray(order?.relationIds) ? order.relationIds.map(text).filter(Boolean) : []),
  ));

  let hyperlink = "";
  if (relationIds.length) {
    hyperlink = `${text(baseUrl).replace(/\/+$/, "")}/next/orders/receipt-viewer?ids=${encodeURIComponent(relationIds.join(","))}`;
  } else {
    const firstOrder = orders.find((order) => text(order?.receiptViewerUrl || order?.trackingUrl)) || null;
    if (firstOrder) hyperlink = absoluteAppUrl(baseUrl, firstOrder.receiptViewerUrl || firstOrder.trackingUrl || "");
  }

  return {
    text: orderIds.join(", ") || fallbackText || text(orders[0]?.label) || "Order",
    hyperlink,
  };
}

function collectPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });
}

async function renderExpensePdf({ userName, userId, items, dateFrom, dateTo }) {
  const rows = safeItems(items);
  if (!rows.length) {
    const error = new Error((dateFrom || dateTo) ? "No expenses found for the selected period." : "No expenses to export.");
    error.status = 400;
    throw error;
  }

  await ensurePdfArabicSupport();
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  enableArabicPdf(doc);
  const bufferPromise = collectPdfBuffer(doc);
  attachPageNumbers(doc);

  const now = new Date();
  const timestamp = now.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  drawStocktakingHeader(doc, {
    title: "Expenses Report",
    subtitle: `User: ${text(userName) || "-"}  •  Generated: ${timestamp}`,
  });

  doc
    .fillColor("#6B7280")
    .font("Helvetica")
    .fontSize(10)
    .text(`User ID: ${text(userId) || "-"}  •  Type: All`, { align: "left" });
  doc.moveDown(0.8);

  let fromText = formatDisplayDate(dateFrom);
  let toText = formatDisplayDate(dateTo);
  if ((!dateFrom || !dateTo) && rows.length) {
    const dates = rows.map((row) => text(row?.date)).filter(Boolean).sort();
    if (!dateFrom && dates.length) fromText = formatDisplayDate(dates[0]);
    if (!dateTo && dates.length) toText = formatDisplayDate(dates[dates.length - 1]);
  }

  const durationY = doc.y;
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#000").text("Duration:", 40, durationY);
  doc.roundedRect(130, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
  doc.roundedRect(320, durationY - 5, 170, 30, 8).stroke("#CFCFCF");
  doc.font("Helvetica").fontSize(13).fillColor("#000").text(fromText, 140, durationY + 5);
  doc.text(toText, 330, durationY + 5);

  const totalIn = rows.reduce((sum, item) => sum + number(item?.cashIn), 0);
  const totalOut = rows.reduce((sum, item) => sum + number(item?.cashOut), 0);
  const balance = totalIn - totalOut;
  const summaryY = durationY + 50;

  doc.roundedRect(40, summaryY, 150, 70, 12).stroke("#D9D9D9");
  doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Total Cash in", 50, summaryY + 15);
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#16A34A").text(`${totalIn.toLocaleString()} EGP`, 50, summaryY + 38);

  doc.roundedRect(210, summaryY, 150, 70, 12).stroke("#D9D9D9");
  doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Total Cash out", 220, summaryY + 15);
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#DC2626").text(`${totalOut.toLocaleString()} EGP`, 220, summaryY + 38);

  doc.roundedRect(380, summaryY, 150, 70, 12).stroke("#D9D9D9");
  doc.font("Helvetica").fontSize(12).fillColor("#666666").text("Final Balance", 390, summaryY + 15);
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#2563EB").text(`${balance.toLocaleString()} EGP`, 390, summaryY + 38);

  doc.font("Helvetica-Bold").fontSize(13).fillColor("#000").text(`Total No. of entries: ${rows.length}`, 40, summaryY + 90);

  const tableTop = summaryY + 120;
  const tableLeft = 40;
  const tableRight = 560;
  const tableWidth = tableRight - tableLeft;
  const headerHeight = 24;
  const cellPaddingX = 6;
  const columns = [
    { key: "date", label: "Date", width: 60 },
    { key: "fundsType", label: "Type", width: 75 },
    { key: "reason", label: "Reason", width: 115 },
    { key: "from", label: "From", width: 45 },
    { key: "to", label: "To", width: 45 },
    { key: "kilometer", label: "KM", width: 30 },
    { key: "cashIn", label: "Cash In", width: 70 },
    { key: "cashOut", label: "Cash Out", width: 80 },
  ];

  let accX = tableLeft;
  columns.forEach((column) => {
    column.x = accX;
    accX += column.width;
  });

  let y = tableTop;
  doc.roundedRect(tableLeft, y, tableWidth, 300, 6).stroke("#E5E7EB");
  doc.rect(tableLeft, y, tableWidth, headerHeight).fill("#F5F5F5");
  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(10);
  columns.forEach((column) => {
    doc.text(column.label, column.x + cellPaddingX, y + 6, {
      width: column.width - (2 * cellPaddingX),
      align: "left",
    });
  });
  doc.moveTo(tableLeft, y + headerHeight).lineTo(tableRight, y + headerHeight).lineWidth(0.8).stroke("#E5E7EB");
  y += headerHeight;
  doc.font("Helvetica").fontSize(9);

  rows.forEach((item, index) => {
    const rowData = {
      date: formatDisplayDate(item?.date),
      fundsType: text(item?.fundsType) || "-",
      reason: text(item?.reason) || "-",
      from: text(item?.from) || "-",
      to: text(item?.to) || "-",
      kilometer: item?.kilometer != null ? String(item.kilometer) : "-",
      cashIn: number(item?.cashIn) > 0 ? number(item?.cashIn).toLocaleString() : "-",
      cashOut: number(item?.cashOut) > 0 ? number(item?.cashOut).toLocaleString() : "-",
    };

    const heights = columns.map((column) => doc.heightOfString(rowData[column.key], {
      width: column.width - (2 * cellPaddingX),
      align: "left",
    }));
    let rowHeight = Math.max(...heights) + 6;
    if (rowHeight < 18) rowHeight = 18;

    if (index % 2 === 0) doc.rect(tableLeft, y, tableWidth, rowHeight).fill("#FAFAFA");
    doc.lineWidth(0.4).strokeColor("#E5E7EB");
    columns.forEach((column, columnIndex) => {
      if (columnIndex > 0) doc.moveTo(column.x, y).lineTo(column.x, y + rowHeight).stroke();
    });
    doc.moveTo(tableRight, y).lineTo(tableRight, y + rowHeight).stroke();

    columns.forEach((column) => {
      const value = rowData[column.key];
      if (column.key === "cashIn") {
        if (number(item?.cashIn) > 0) doc.fillColor("#16A34A").font("Helvetica-Bold");
        else doc.fillColor("#9CA3AF").font("Helvetica");
      } else if (column.key === "cashOut") {
        if (number(item?.cashOut) > 0) doc.fillColor("#DC2626").font("Helvetica-Bold");
        else doc.fillColor("#9CA3AF").font("Helvetica");
      } else {
        doc.fillColor("#111827").font("Helvetica");
      }
      doc.text(value, column.x + cellPaddingX, y + 4, {
        width: column.width - (2 * cellPaddingX),
        align: "left",
      });
    });

    y += rowHeight;
    doc.moveTo(tableLeft, y).lineTo(tableRight, y).lineWidth(0.4).stroke("#E5E7EB");
  });

  doc.end();
  const buffer = await bufferPromise;
  const cleanName = safeExportName(text(userName) || "expenses");
  return {
    buffer,
    fileName: `${cleanName}_expenses.pdf`,
    contentType: "application/pdf",
  };
}

function numberFormat(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || Math.abs(numeric - Math.round(numeric)) < 1e-9) return "#,##0;-#,##0;0";
  return "#,##0.##;-#,##0.##;0";
}

function hashStr(value) {
  let hash = 5381;
  const raw = String(value || "");
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) + hash) + raw.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

async function renderExpenseExcel({ userName, items, dateFrom, dateTo, baseUrl }) {
  const rows = safeItems(items);
  const normalizedDateFrom = text(dateFrom);
  const normalizedDateTo = text(dateTo);
  const hasSelectedPeriod = !!(normalizedDateFrom || normalizedDateTo);
  if (!rows.length) {
    const error = new Error(hasSelectedPeriod ? "No expenses found for the selected period." : "No expenses to export.");
    error.status = 400;
    throw error;
  }

  const displayName = displayUserName(userName);
  const maxScreenshotCount = rows.reduce((maxCount, item) => Math.max(maxCount, expenseScreenshotEntries(item).length), 0);
  const totalCashIn = rows.reduce((sum, item) => sum + number(item?.cashIn), 0);
  const totalCashOut = rows.reduce((sum, item) => sum + number(item?.cashOut), 0);
  const totalBalance = totalCashIn - totalCashOut;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Operations Dashboard";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Expenses");

  const borderColor = { argb: "FF9CA3AF" };
  const borderThin = {
    top: { style: "thin", color: borderColor },
    left: { style: "thin", color: borderColor },
    bottom: { style: "thin", color: borderColor },
    right: { style: "thin", color: borderColor },
  };
  const fundsTypePalette = [
    "FFFDE68A", "FFBFDBFE", "FFBBF7D0", "FFFECACA", "FFE9D5FF", "FFFBCFE8",
    "FFFED7AA", "FF99F6E4", "FFC7D2FE", "FFD9F99D", "FFA5F3FC", "FFF5E6D3",
  ];
  const fundsTypeFill = (value) => {
    const raw = text(value);
    return raw ? fundsTypePalette[hashStr(raw.toLowerCase()) % fundsTypePalette.length] : null;
  };

  const screenshotColumns = Array.from({ length: maxScreenshotCount }, (_, index) => ({
    header: `Screenshot ${index + 1}`,
    width: 18,
  }));
  const columns = [
    { header: "Date", width: 14 },
    { header: "Funds Type", width: 18 },
    { header: "Reason", width: 36 },
    { header: "From", width: 18 },
    { header: "To", width: 18 },
    { header: "Kilometers", width: 14 },
    { header: "Cash In", width: 14 },
    { header: "Cash Out", width: 14 },
    ...screenshotColumns,
  ];
  const lastCol = columns.length;
  columns.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width; });

  sheet.mergeCells(1, 1, 1, lastCol);
  const titleCell = sheet.getCell("A1");
  titleCell.value = `Expenses Report — ${displayName}`;
  titleCell.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, lastCol);
  const metaCell = sheet.getCell("A2");
  const periodLabel = hasSelectedPeriod ? `Period: ${normalizedDateFrom || "Any"} → ${normalizedDateTo || "Any"}` : "";
  metaCell.value = [`Generated: ${new Date().toISOString().slice(0, 10)}`, periodLabel].filter(Boolean).join(" • ");
  metaCell.font = { italic: true, color: { argb: "FF6B7280" } };
  metaCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.getRow(2).height = hasSelectedPeriod ? 28 : 18;

  sheet.mergeCells("A3:B3");
  const summaryHead = sheet.getCell("A3");
  summaryHead.value = "Summary";
  summaryHead.font = { bold: true, color: { argb: "FFFFFFFF" } };
  summaryHead.alignment = { horizontal: "center", vertical: "middle" };
  summaryHead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  sheet.getRow(3).height = 18;

  const summaryRows = [
    { label: "Total Cash In", value: totalCashIn, color: "FF16A34A" },
    { label: "Total Cash Out", value: totalCashOut, color: "FFDC2626" },
    { label: "Total Balance", value: totalBalance, color: "FF2563EB" },
  ];
  summaryRows.forEach((entry, index) => {
    const rowIndex = 4 + index;
    const labelCell = sheet.getCell(`A${rowIndex}`);
    const valueCell = sheet.getCell(`B${rowIndex}`);
    labelCell.value = entry.label;
    labelCell.font = { bold: true, color: { argb: "FF111827" } };
    labelCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    valueCell.value = number(entry.value);
    valueCell.numFmt = numberFormat(entry.value);
    valueCell.font = { bold: true, color: { argb: entry.color } };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(rowIndex).height = 18;
  });

  for (let row = 3; row <= 6; row += 1) {
    for (let column = 1; column <= 2; column += 1) sheet.getRow(row).getCell(column).border = borderThin;
  }

  const startRow = 8;
  const headerRow = sheet.getRow(startRow);
  headerRow.height = 20;
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    cell.border = borderThin;
  });
  sheet.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow, column: columns.length } };

  rows.forEach((item) => {
    const date = item?.date ? new Date(item.date) : null;
    const dateValue = date && !Number.isNaN(date.getTime()) ? date : (item?.date || "");
    const reasonPayload = expenseReasonExportPayload(item, baseUrl);
    const screenshots = expenseScreenshotEntries(item);
    const expenseId = text(item?.id);
    const screenshotValues = Array.from({ length: maxScreenshotCount }, (_, index) => {
      const shot = screenshots[index] || null;
      if (!shot) return "";
      const rawUrl = text(shot.url);
      const hyperlink = expenseId
        ? `${text(baseUrl).replace(/\/+$/, "")}/next/api/expenses/screenshot-direct?expenseId=${encodeURIComponent(expenseId)}&index=${index}`
        : rawUrl;
      if (!hyperlink) return "";
      return { text: text(shot.name) || `Screenshot ${index + 1}`, hyperlink };
    });

    const row = sheet.addRow([
      dateValue,
      text(item?.fundsType),
      reasonPayload.text || "",
      text(item?.from),
      text(item?.to),
      number(item?.kilometer),
      number(item?.cashIn),
      number(item?.cashOut),
      ...screenshotValues,
    ]);
    if (reasonPayload.hyperlink && reasonPayload.text) {
      const cell = row.getCell(3);
      cell.value = { text: reasonPayload.text, hyperlink: reasonPayload.hyperlink };
      cell.font = { color: { argb: "FF2563EB" }, underline: true };
    }
    screenshotValues.forEach((value, index) => {
      if (!value || typeof value !== "object") return;
      const cell = row.getCell(9 + index);
      cell.value = value;
      cell.font = { color: { argb: "FF2563EB" }, underline: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
  });

  const bodyStart = startRow + 1;
  const bodyEnd = sheet.rowCount;
  for (let rowIndex = bodyStart; rowIndex <= bodyEnd; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    row.height = 18;
    const zebra = (rowIndex - bodyStart) % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.border = borderThin;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9FAFB" } };
      if (columnNumber === 1 && cell.value instanceof Date) cell.numFmt = "yyyy-mm-dd";
      if (columnNumber === 2) {
        const fill = fundsTypeFill(cell.value);
        if (fill) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
          cell.font = { color: { argb: "FF111827" }, bold: true };
        }
      }
      if (columnNumber === 6) {
        cell.numFmt = numberFormat(cell.value);
        cell.font = { color: { argb: "FF475569" } };
      }
      if (columnNumber === 7) {
        cell.numFmt = numberFormat(cell.value);
        cell.font = { color: { argb: "FF16A34A" } };
      }
      if (columnNumber === 8) {
        cell.numFmt = numberFormat(cell.value);
        cell.font = { color: { argb: "FFDC2626" } };
      }
      if (columnNumber >= 9) cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    });
  }

  function cellTextForWidth(cell) {
    const value = cell?.value;
    if (value === null || typeof value === "undefined") return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    if (typeof value === "object") {
      if (typeof value.text === "string") return value.text;
      if (Array.isArray(value.richText)) return value.richText.map((entry) => entry?.text || "").join("");
    }
    return String(value);
  }

  for (let column = 1; column <= lastCol; column += 1) {
    let maxLength = text(columns[column - 1]?.header).length;
    for (let row = 3; row <= sheet.rowCount; row += 1) {
      maxLength = Math.max(maxLength, cellTextForWidth(sheet.getRow(row).getCell(column)).length);
    }
    sheet.getColumn(column).width = Math.min(60, Math.max(10, maxLength + 2));
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const filenameParts = [displayName, "expenses"];
  if (hasSelectedPeriod) filenameParts.push(normalizedDateFrom || "start", "to", normalizedDateTo || "end");
  filenameParts.push(new Date().toISOString().slice(0, 10));
  return {
    buffer,
    fileName: `${safeExportName(filenameParts.join("_"))}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

export async function renderExpenseExport({ kind, userName, userId, items, dateFrom, dateTo, baseUrl = "" } = {}) {
  const exportKind = text(kind).toLowerCase();
  if (exportKind === "pdf") return await renderExpensePdf({ userName, userId, items, dateFrom, dateTo });
  if (exportKind === "excel" || exportKind === "xlsx") return await renderExpenseExcel({ userName, items, dateFrom, dateTo, baseUrl });
  const error = new Error("Unsupported expense export type.");
  error.status = 400;
  throw error;
}
