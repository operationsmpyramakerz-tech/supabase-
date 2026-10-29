// Shared, dependency-free layout data for Stocktaking Excel and PDF reports.
// Keep every source row: identical component names/codes can represent different stock records.
export function reportText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

export function stocktakingReportRows(items, selectedColumns = []) {
  return (Array.isArray(items) ? items : []).filter((item) => {
    const quantity = Number(item?.quantity);
    const inventory = Number(item?.inventory);
    const defected = Number(item?.defected);
    return (Number.isFinite(quantity) && quantity !== 0)
      || (selectedColumns.includes("inventory") && item?.inventory != null && Number.isFinite(inventory))
      || (selectedColumns.includes("defected") && item?.defected != null && Number.isFinite(defected));
  }).slice().sort((a, b) =>
    reportText(a?.tag?.name).localeCompare(reportText(b?.tag?.name), undefined, { numeric: true, sensitivity: "base" })
    || reportText(a?.name).localeCompare(reportText(b?.name), undefined, { numeric: true, sensitivity: "base" })
    || reportText(a?.id).localeCompare(reportText(b?.id), undefined, { numeric: true, sensitivity: "base" })
  );
}

export function stocktakingReportGroups(rows = []) {
  const groups = new Map();
  for (const item of rows) {
    const tagName = reportText(item?.tag?.name) || "Untagged";
    if (!groups.has(tagName)) groups.set(tagName, []);
    groups.get(tagName).push(item);
  }
  return [...groups.entries()].map(([tag, items]) => ({ tag, items }));
}

export function stocktakingReportSummary(rows = []) {
  let quantity = 0;
  let stockValue = 0;
  for (const item of rows) {
    const q = Number(item?.quantity);
    const unit = Number(item?.unitPrice);
    if (Number.isFinite(q)) {
      quantity += q;
      if (Number.isFinite(unit)) stockValue += q * unit;
    }
  }
  return { items: rows.length, quantity, stockValue, tags: stocktakingReportGroups(rows).length };
}

export function stocktakingReportCell(item, key) {
  if (key === "idCode") return reportText(item?.idCode);
  if (key === "component") return reportText(item?.name) || "-";
  if (key === "receiptNumber") return reportText(item?.receiptNumber).replace(/\r\n?/g, "\n").split(/[\n,]+/).map(reportText).filter(Boolean).join(", ");
  if (key === "stock") return Number(item?.quantity) || 0;
  if (key === "inventory" || key === "defected") return item?.[key] == null ? "" : Number(item[key]);
  if (key === "unityPrice") return item?.unitPrice == null ? "" : Number(item.unitPrice);
  if (key === "totalPrice") return item?.unitPrice == null ? "" : (Number(item?.quantity) || 0) * Number(item.unitPrice);
  return "";
}
