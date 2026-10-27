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

function indexedCandidates(index, key, componentName) {
  if (!key) return [];
  // Legacy product IDs and display codes are not guaranteed unique. A row with
  // a real product name must never inherit another component's identity solely
  // because its code/ID was reused (e.g. both propellers have A100177).
  return [...(index.get(key) || [])].filter((candidate) =>
    !componentName || !candidate._nameKey || candidate._nameKey === componentName);
}

function addToIndex(index, key, target) {
  if (!key) return;
  if (!index.has(key)) index.set(key, new Set());
  index.get(key).add(target);
}

function kitNamesOf(row) {
  const raw = text(row?.kitTag) || "Unassigned kit";
  // A single source order may already describe several kits ("G2 - G3").
  // Split the display separator so kits shared by multiple orders are only
  // printed once. Do not split a single-word hyphenated kit name ("G2-A").
  return raw.split(/\s+-\s+/).map(text).filter(Boolean);
}

/**
 * @param {Array<{rows: object[]}>} orderPayloads An entry per selected order.
 * @param {Array<{label?: string}>} orderMeta Must use the same order as payloads.
 * @returns {object[]} One component row with one column per order/metric.
 * @throws When a name genuinely maps to different codes, or totals cannot reconcile.
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

      // Prefer exact normalized component names. Fallback IDs/codes may be
      // reused across DIFFERENT physical products; use them only when the
      // candidate has no conflicting reliable name.
      const matches = new Set([
        reliableName ? byName.get(reliableName) : undefined,
        ...indexedCandidates(byCode, code, reliableName),
        ...indexedCandidates(byProductId, productId, reliableName),
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
          _nameKey: reliableName,
          _combinedOrderValues: {},
          _codes: new Set(),
          _sourceKitGroups: new Set(),
          _sourceFolderGroups: new Set(),
          _kitNames: new Map(),
        };
        combinedRows.push(target);
      }
      if (code) target._codes.add(code);
      if (reliableName && !target._nameKey) target._nameKey = reliableName;

      const sourceFolder = text(sourceRow?.kitFolderName) || "Unfiled Kits";
      target._sourceFolderGroups.add(sourceFolder);
      for (const sourceKit of kitNamesOf(sourceRow)) {
        const key = sourceKit.toLocaleLowerCase();
        if (!target._kitNames.has(key)) target._kitNames.set(key, sourceKit);
        target._sourceKitGroups.add(`${sourceFolder.toLowerCase()}|${key}`);
      }
      if (!text(target.idCode) && text(sourceRow?.idCode)) target.idCode = sourceRow.idCode;
      if (!text(target.link) && text(sourceRow?.link)) target.link = sourceRow.link;
      if ((!text(target.productTag) || target.productTag === "Uncategorized") && text(sourceRow?.productTag)) target.productTag = sourceRow.productTag;
      if ((!text(target.kitTag) || target.kitTag === "Unassigned kit") && text(sourceRow?.kitTag)) target.kitTag = sourceRow.kitTag;
      if ((!text(target.kitFolderName) || target.kitFolderName === "Unfiled Kits") && text(sourceRow?.kitFolderName)) target.kitFolderName = sourceRow.kitFolderName;
      if ((!Number.isFinite(Number(target.unit)) || Number(target.unit) === 0) && Number.isFinite(Number(sourceRow?.unit))) target.unit = Number(sourceRow.unit);

      // Register all known aliases, without assuming a code/ID is unique.
      if (reliableName) byName.set(reliableName, target);
      addToIndex(byCode, code, target);
      addToIndex(byProductId, productId, target);

      const values = target._combinedOrderValues[orderIndex] || Object.fromEntries(COMBINED_ORDER_METRIC_KEYS.map((metric) => [metric, 0]));
      // One product may be sourced from several kits / legacy order lines at
      // DIFFERENT unit prices. Keep each source line's cost and derive only
      // the weighted-average unit price for a combined cell.
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

  const result = combinedRows.map(({ _nameKey, _codes, _combinedOrderValues, _sourceKitGroups, _sourceFolderGroups, _kitNames, ...row }) => {
    const out = { ...row };
    const names = [..._kitNames.values()];
    // The source kits are real names, not a placeholder like "Multiple Kits".
    const meaningful = names.filter((name) => name.toLowerCase() !== "multiple kits");
    out.kitTag = meaningful.length
      ? meaningful.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })).join(" - ")
      : "Unassigned kit";
    if (_sourceKitGroups.size > 1) {
      out.kitFolderName = _sourceFolderGroups.size === 1 && !(_sourceFolderGroups.has("Multiple Folders"))
        ? [..._sourceFolderGroups][0] : "Multiple Folders";
    }
    orderMeta.forEach((order, orderIndex) => {
      const values = _combinedOrderValues[orderIndex] || {};
      const sources = values._priceSources || [];
      const distinctPrices = sources.length > 1 && sources.some((source) =>
        Math.abs(source.unit - sources[0].unit) > 1e-6);
      const quantity = Number(values.qty || 0);
      const totalCost = Number(values.total || 0);
      const unit = !sources.length ? 0
        : !distinctPrices ? sources[0].unit
          : Math.abs(quantity) > 1e-9 ? totalCost / quantity : null;
      if (unit !== null && !Number.isFinite(unit)) {
        throw invalidExport(`Invalid combined unit cost in ${text(order?.label) || `Order ${orderIndex + 1}`}.`);
      }
      out[combinedMetricColumnKey("unit", orderIndex)] = unit;
      if (distinctPrices) out[combinedMetricColumnKey("unitSources", orderIndex)] = sources;
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
