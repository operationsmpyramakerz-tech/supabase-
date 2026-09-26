import PDFDocument from "pdfkit";

import { directKpisContext, kpiErrorMessage, kpisReviews } from "../../../../lib/kpis-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function text(value) { return String(value ?? "").trim(); }
function monthLabel(value) {
  const match = text(value).match(/^(\d{4})-(\d{2})/);
  if (!match) return text(value) || "-";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function collectPdf(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function GET(request) {
  const context = await directKpisContext().catch(() => null);
  if (!context?.ok) return Response.json({ ok: false, error: context?.error || "KPI access denied." }, { status: context?.status || 503 });
  try {
    const url = new URL(request.url);
    const query = Object.fromEntries(url.searchParams.entries());
    delete query.tab;
    const { reviews = [] } = await kpisReviews(context, query, { force: true });

    const doc = new PDFDocument({ size: "A4", margin: 42, info: { Title: "KPI Reviews Report" } });
    const done = collectPdf(doc);
    const pageWidth = doc.page.width - 84;
    doc.font("Helvetica-Bold").fontSize(20).text("KPI Reviews Report", { align: "left" });
    doc.moveDown(0.25);
    doc.font("Helvetica").fontSize(9).fillColor("#666666").text(`Generated ${new Date().toLocaleString("en-US")}`);
    const filters = [query.department && `Department: ${query.department}`, (query.rolePosition || query.position) && `Role: ${query.rolePosition || query.position}`, query.from && `From: ${monthLabel(query.from)}`, query.to && `To: ${monthLabel(query.to)}`].filter(Boolean);
    if (filters.length) { doc.moveDown(0.5); doc.fillColor("#444444").text(filters.join("  |  ")); }
    doc.moveDown(1);

    const cols = [
      { label: "Employee", key: "teamMemberName", width: 125 },
      { label: "Department", key: "department", width: 100 },
      { label: "Month", key: "reviewMonth", width: 75 },
      { label: "Score", key: "finalPercentage", width: 65 },
      { label: "KPI", key: "standardTitle", width: pageWidth - 365 },
    ];
    const drawHeader = () => {
      const y = doc.y;
      doc.rect(42, y, pageWidth, 22).fill("#eeeeee");
      let x = 42;
      doc.fillColor("#111111").font("Helvetica-Bold").fontSize(8);
      for (const col of cols) { doc.text(col.label, x + 5, y + 7, { width: col.width - 10 }); x += col.width; }
      doc.y = y + 22;
    };
    drawHeader();
    if (!reviews.length) {
      doc.moveDown(1).font("Helvetica").fontSize(10).fillColor("#666666").text("No KPI reviews found for the selected filters.");
    } else {
      for (const row of reviews) {
        if (doc.y > doc.page.height - 70) { doc.addPage(); drawHeader(); }
        const y = doc.y; const rowHeight = 30;
        let x = 42;
        const values = [text(row.teamMemberName) || "-", text(row.department) || "-", monthLabel(row.reviewMonth), `${Number(row.finalPercentage || 0).toFixed(1)}%\n${text(row.performanceRating) || "-"}`, text(row.standardTitle) || "-"];
        doc.rect(42, y, pageWidth, rowHeight).strokeColor("#dddddd").lineWidth(0.5).stroke();
        doc.font("Helvetica").fontSize(8).fillColor("#222222");
        cols.forEach((col, index) => { doc.text(values[index], x + 5, y + 6, { width: col.width - 10, height: rowHeight - 10, ellipsis: true }); x += col.width; });
        doc.y = y + rowHeight;
      }
    }
    doc.end();
    const pdf = await done;
    return new Response(pdf, {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="kpi-reviews-${new Date().toISOString().slice(0, 10)}.pdf"`, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return Response.json({ ok: false, error: kpiErrorMessage(error) }, { status: Number(error?.status) || 500 });
  }
}
