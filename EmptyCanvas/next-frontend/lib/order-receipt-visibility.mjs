const RECEIPT_FILE_FIELDS = Object.freeze([
  "orderReceiptEntries", "orderReceiptNames", "orderReceiptUrls", "orderReceiptName", "orderReceiptUrl",
  "maintenanceReceiptEntries", "maintenanceReceiptNames", "maintenanceReceiptUrls", "maintenanceReceiptName", "maintenanceReceiptUrl",
]);

// Do not transmit document URLs or names when the independent receipt
// permission is denied. Store receipt numbers are workflow metadata, not files.
export function hideOrderReceiptFiles(items, allowed) {
  if (allowed || !Array.isArray(items)) return items;
  return items.map(item => {
    const safe = { ...item };
    for (const field of RECEIPT_FILE_FIELDS) delete safe[field];
    return safe;
  });
}
