"use strict";

/**
 * Sum the Total Cost values of exactly the rows displayed in an order export.
 * The original order-level grandTotal may include rows removed by combined
 * export filters, so it must NOT be used for the optional footer.
 *
 * The routine is shared by the PDF (CommonJS) and Excel (ESM) renderers.
 */
function grandTotalFromExportRows(rows) {
  let sum = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = Number(row?.total);
    if (Number.isFinite(value)) sum += value;
  }
  return Math.round((sum + Number.EPSILON) * 100) / 100;
}

module.exports = { grandTotalFromExportRows };
