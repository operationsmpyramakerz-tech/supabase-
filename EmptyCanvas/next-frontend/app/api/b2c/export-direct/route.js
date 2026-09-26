import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { b2cErrorMessage, b2cTablePayload, directB2cContext } from "../../../../lib/b2c-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function text(value, max = 0) {
  const out = String(value ?? "").trim();
  return max > 0 ? out.slice(0, max) : out;
}
function safeExcelName(value, fallback = "b2c-table") {
  return text(value, 120).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || fallback;
}
function cellValue(record, field) {
  const value = field?.type === "formula" ? record?.formulaValues?.[field.key] : record?.values?.[field.key];
  if (field?.type === "files") {
    return (Array.isArray(value) ? value : []).map((file) => `${text(file?.name || "Attachment", 240)}${file?.url ? ` (${text(file.url, 3000)})` : ""}`).join("; ");
  }
  if (Array.isArray(value)) return value.map((item) => text(item?.name || item, 500)).filter(Boolean).join("; ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return ""; }
  }
  return String(value);
}

export async function GET(request) {
  const context = await directB2cContext(["Customer Database"]).catch(() => null);
  if (!context) return NextResponse.json({ ok: false, error: "Direct B2C access is unavailable." }, { status: 503 });
  if (!context.ok) return NextResponse.json({ ok: false, error: context.error }, { status: context.status || 403 });

  try {
    const databaseId = text(new URL(request.url).searchParams.get("id"), 60);
    if (!databaseId) return NextResponse.json({ ok: false, error: "A B2C database id is required." }, { status: 400 });
    const payload = await b2cTablePayload(databaseId, { force: true });
    if (!payload?.database) return NextResponse.json({ ok: false, error: "B2C table was not found." }, { status: 404 });

    const { database, fields = [], records = [] } = payload;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Operations";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet(safeExcelName(database.name, "B2C Table").slice(0, 31) || "B2C Table", { views: [{ state: "frozen", ySplit: 1 }] });
    const headings = ["Record ID", ...fields.map((field) => field.label), "Submitted by", "Created"];
    worksheet.addRow(headings);
    records.forEach((record) => {
      worksheet.addRow([
        record.customerCode || "",
        ...fields.map((field) => cellValue(record, field)),
        record.createdByName || "",
        record.createdAt ? new Date(record.createdAt) : "",
      ]);
    });
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, records.length + 1), column: Math.max(1, headings.length) } };
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    worksheet.getRow(1).alignment = { vertical: "middle" };
    worksheet.getColumn(1).width = 15;
    fields.forEach((field, index) => { worksheet.getColumn(index + 2).width = Math.min(45, Math.max(16, String(field.label || "").length + 8)); });
    worksheet.getColumn(fields.length + 2).width = 22;
    worksheet.getColumn(fields.length + 3).width = 22;
    worksheet.eachRow((row, rowNumber) => {
      row.alignment = { vertical: "top", wrapText: true };
      if (rowNumber > 1) row.height = 28;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${safeExcelName(database.name, "b2c-table").replace(/\s+/g, "-")}-records.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("GET /next/api/b2c/export-direct error:", error?.details || error);
    return NextResponse.json({ ok: false, error: b2cErrorMessage(error) }, { status: Number(error?.status) || 500 });
  }
}
