/**
 * Audited, lossless aggregation of component quantities across Operations Orders.
 * The raw Supabase product_id is NOT a reliable cross-order grouping key:
 * legacy/proposal rows can hold different (or missing) IDs for the same product.
 */
export const COMBINED_ORDER_METRIC_KEYS = Object.freeze([
  "qty", "receivedQty", "remainingQty", "deliveredQty", "total",
]);

export function combinedMetricColumnKey(metricKey, orderIndex) {
  return `combined__${metricKey}__${orderIndex}`;
}

function text(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

function componentNameKey(value) {
  // Keep punctuation in quantities/specifications: 1.2V != 12V.
  // Ignore casing, typographic dashes, and non-semantic whitespace only.
  return text(value).normalize("NFKC").toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s*([,:;\-])\s*/g, "$1")
    .replace(/\s+/g, " ").trim();
}

function idCodeKey(value) {
  return text(value).normalize("NFKC").toUpperCase().replace(/\s+/g, "");
}

function numberValue(value, metric, component, label) {
  if (value === null || typeof value === "undefined" || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw invalidExport(`Invalid ${metric} for "${component}" in ${label}.`);
  }
  return parsed;
}

function roundQty(value) {
  return Math.round((value + Number.EPSILON) * 1e6) / 1e6;
}

function invalidExport(message) {
  const error = new Error(`Combined orders export stopped: ${message}`);
  error.status = 422;
  return error;
}

function productIdOf(row) {
  const direct = text(row?._productId);
  if (direct) return direct;
  const key = text(row?._componentKey);
  return key.startsWith("product:") ? key.slice(8) : "";
}

/**
 * @param {Array<{rows: object[]}>} orderPayloads An entry per selected order.
 * @param {Array<{label?: string}>} orderMeta Must use the same order as payloads.
 * @returns {object[]} One component row with one column per order/metric.
 * @throws When two different product codes share a name, or totals cannot reconcile.
 */
export function mergeCombinedOrderRows(orderPayloads = [], orderMeta = []) {
  if (!Array.isArray(orderPayloads) || !Array.isArray(orderMeta) || orderPayloads.length !== orderMeta.length) {
    throw invalidExport("Selected orders and export data do not match.");
  }

  const combinedRows = [];
  const byName = new Map();
  const byCode = new Map();
  const byProductId = new Map();
  const expected = orderPayloads.map(() => Object.fromEntries(COMBINED_ORDER_METRIC_KEYS.map((metric) => [metric, 0])));

  orderPayloads.forEach((payload, orderIndex) => {
    const label = text(orderMeta[orderIndex]?.label) || `Order ${orderIndex + 1}`;
    for (const sourceRow of Array.isArray(payload?.rows) ? payload.rows : []) {
      const component = text(sourceRow?.component) || "Unknown Product";
      const name = componentNameKey(component);
      const reliableName = name && name !== "unknown product" ? name : "";
      const code = idCodeKey(sourceRow?.idCode);
      const productId = productIdOf(sourceRow);
      if (!reliableName && !code && !productId) {
        throw invalidExport(`Cannot identify a component in ${label}.`);
      }

      const matches = new Set([
        reliableName ? byName.get(reliableName) : undefined,
        code ? byCode.get(code) : undefined,
        productId ? byProductId.get(productId) : undefined,
      ].filter(Boolean));
      if (matches.size > 1) {
        throw invalidExport(`Conflicting product identities for "${component}" in ${label}. Check the product name and ID Code in the source orders.`);
      }
      let target = matches.values().next().value;
      if (target && target._codes.size && code && !target._codes.has(code)) {
        throw invalidExport(`"${component}" has different ID Codes across the selected orders. Correct them before exporting.`);
      }

      if (!target) {
        target = {
          ...sourceRow,
          qty: 0,
          receivedQty: 0,
          remainingQty: 0,
          deliveredQty: 0,
          total: 0,
          _combinedOrderValues: {},
          _codes: new Set(),
        };
        combinedRows.push(target);
      }
      if (code) target._codes.add(code);
      if (!text(target.idCode) && text(sourceRow?.idCode)) target.idCode = sourceRow.idCode;
      if (!text(target.link) && text(sourceRow?.link)) target.link = sourceRow.link;
      if ((!text(target.productTag) || target.productTag === "Uncategorized") && text(sourceRow?.productTag)) target.productTag = sourceRow.productTag;
      if ((!text(target.kitTag) || target.kitTag === "Unassigned kit") && text(sourceRow?.kitTag)) target.kitTag = sourceRow.kitTag;
      if ((!text(target.kitFolderName) || target.kitFolderName === "Unfiled Kits") && text(sourceRow?.kitFolderName)) target.kitFolderName = sourceRow.kitFolderName;
      if ((!Number.isFinite(Number(target.unit)) || Number(target.unit) === 0) && Number.isFinite(Number(sourceRow?.unit))) target.unit = Number(sourceRow.unit);

      // Register all known aliases so names matching across different legacy IDs
      // (or codes matching after product names change) still land on ONE row.
      if (reliableName) byName.set(reliableName, target);
      if (code) byCode.set(code, target);
      if (productId) byProductId.set(productId, target);

      const values = target._combinedOrderValues[orderIndex] || Object.fromEntries(COMBINED_ORDER_METRIC_KEYS.map((metric) => [metric, 0]));
      // One product may be sourced from several kits / legacy order lines at
      // DIFFERENT unit prices. That is not a quantity error. Keep each source
      // line's cost, and derive a weighted average only for the unit-price cell.
      // Never overwrite prices with the first/last line's arbitrary price.
      const unit = numberValue(sourceRow?.unit, "unit", component, label);
      const sourceMetrics = Object.fromEntries(COMBINED_ORDER_METRIC_KEYS.map((metric) => [
        metric, numberValue(sourceRow?.[metric], metric, component, label),
      ]));
      if (!values._priceSources) values._priceSources = [];
      values._priceSources.push({
        unit, qty: sourceMetrics.qty, total: sourceMetrics.total,
        kitTag: text(sourceRow?.kitTag),
      });
      for (const metric of COMBINED_ORDER_METRIC_KEYS) {
        values[metric] = roundQty(values[metric] + sourceMetrics[metric]);
        expected[orderIndex][metric] += sourceMetrics[metric];
      }
      target._combinedOrderValues[orderIndex] = values;
    }
  });

  const result = combinedRows.map(({ _codes, _combinedOrderValues, ...row }) => {
    const out = { ...row };
    orderMeta.forEach((order, orderIndex) => {
      const values = _combinedOrderValues[orderIndex] || {};
      const sources = values._priceSources || [];
      const distinctPrices = sources.length > 1 && sources.some((source) =>
        Math.abs(source.unit - sources[0].unit) > 1e-6);
      const quantity = Number(values.qty || 0);
      const totalCost = Number(values.total || 0);
      // A mixed-price row MUST retain the sum of the underlying line totals.
      // The only price representing that combined row is totalCost / quantity.
      // With zero net quantity a meaningful average does not exist; leave the
      // price blank instead of inventing a price or dividing by zero.
      const unit = !sources.length ? 0
        : !distinctPrices ? sources[0].unit
          : Math.abs(quantity) > 1e-9 ? totalCost / quantity : null;
      if (unit !== null && !Number.isFinite(unit)) {
        throw invalidExport(`Invalid combined unit cost in ${text(order?.label) || `Order ${orderIndex + 1}`}.`);
      }
      out[combinedMetricColumnKey("unit", orderIndex)] = unit;
      if (distinctPrices) {
        // Kept for the Excel cell audit note. Each source retains its original
        // quantity, unit price and cost; no information is discarded.
        out[combinedMetricColumnKey("unitSources", orderIndex)] = sources;
      }
      for (const metric of COMBINED_ORDER_METRIC_KEYS) {
        out[combinedMetricColumnKey(metric, orderIndex)] = values[metric] || 0;
      }
    });
    return out;
  });

  // Fail closed: never return a silently truncated or incorrectly summed file.
  expected.forEach((metrics, orderIndex) => {
    for (const metric of COMBINED_ORDER_METRIC_KEYS) {
      const actual = result.reduce((sum, row) => sum + Number(row[combinedMetricColumnKey(metric, orderIndex)] || 0), 0);
      const tolerance = Math.max(0.0001, 0.000001 * result.length);
      if (Math.abs(actual - metrics[metric]) > tolerance) {
        throw invalidExport(`The ${metric} values in ${text(orderMeta[orderIndex]?.label) || `Order ${orderIndex + 1}`} did not reconcile. No file was generated.`);
      }
    }
  });

  return result.sort((a, b) => text(a.component).localeCompare(text(b.component), undefined, { numeric: true, sensitivity: "base" }));
}
