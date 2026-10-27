// Pure CSV formatter for the standalone Products catalog download.
// Excel interprets leading =, +, -, @ (and formula prefixes after whitespace)
// as formulas; prefix such cells with an apostrophe before CSV quoting.
export const PRODUCT_CSV_COLUMNS = Object.freeze([
  ['displayId', 'ID Code'], ['name', 'Product'], ['unitPrice', 'Unit Price (EGP)'],
  ['unit', 'Unit'], ['tags', 'Tags'], ['url', 'Product URL'],
]);

export function safeProductCsvCell(value) {
  const raw = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  const cell = /^[\s\u0000-\u001f]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${cell.replace(/"/g, '""')}"`;
}

export function renderProductCatalogCsv(products = []) {
  if (!Array.isArray(products) || products.length > 50000) throw new Error('Product export exceeds the 50,000-row limit.');
  const rows = [PRODUCT_CSV_COLUMNS.map(([, label]) => safeProductCsvCell(label)).join(',')];
  for (const product of products) {
    rows.push(PRODUCT_CSV_COLUMNS.map(([key]) => safeProductCsvCell(product?.[key])).join(','));
  }
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}
