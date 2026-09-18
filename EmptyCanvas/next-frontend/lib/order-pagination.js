import "server-only";

import { performance } from "node:perf_hooks";
import { recordPerformanceSample } from "./performance-profiler";
import { select } from "./supabase-rest";

function finiteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function exactOrderNumberFilter(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("eq.")) return null;
  return finiteNumber(raw.slice(3));
}

function positiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function cleanOrderNumbers(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite))];
}

function statusFromError(error) {
  const status = Number(error?.status);
  return Number.isFinite(status) && status > 0 ? status : 500;
}

/**
 * Find distinct order numbers using keyset scans instead of progressively
 * larger OFFSETs. We only need the distinct order_number values in this
 * phase, so when a 1000-row chunk ends in the middle of one order we can
 * safely continue with `order_number < lowestSeen` and skip the remaining
 * duplicate component rows for that same order number.
 */
export async function scanOrderNumberCandidates({
  table,
  cursor = null,
  wanted = 90,
  minWanted = 20,
  maxWanted = 240,
  rowChunk = 1000,
  maxScannedRows = 12000,
  filters = {},
  queryProfileName = "orders.candidates",
  scanProfileName = "orders.candidate-scan",
} = {}) {
  const target = positiveInteger(wanted, 90, minWanted, maxWanted);
  const chunkSize = positiveInteger(rowChunk, 1000, 100, 5000);
  const rowBudget = positiveInteger(maxScannedRows, 12000, chunkSize, 100000);
  const base = { ...(filters || {}) };
  const directNumber = exactOrderNumberFilter(base.order_number);
  let scanCursor = Number.isFinite(directNumber) ? null : finiteNumber(cursor);
  let exhausted = false;
  let scannedRows = 0;
  let requests = 0;
  const unique = [];
  const seen = new Set();
  const startedAt = performance.now();
  let ok = false;
  let status = 0;

  try {
    while (unique.length < target + 1 && !exhausted && scannedRows < rowBudget) {
      const params = {
        select: "order_number",
        order: "order_number.desc",
        limit: String(chunkSize),
        ...base,
      };

      if (!Number.isFinite(directNumber)) {
        if (scanCursor !== null) params.order_number = `lt.${scanCursor}`;
        else if (!params.order_number) params.order_number = "not.is.null";
      }

      requests += 1;
      const rows = await select(table, params, { profileName: queryProfileName });
      const chunk = Array.isArray(rows) ? rows : [];
      scannedRows += chunk.length;

      let lowestSeen = null;
      for (const row of chunk) {
        const orderNumber = finiteNumber(row?.order_number);
        if (!Number.isFinite(orderNumber)) continue;
        if (lowestSeen === null || orderNumber < lowestSeen) lowestSeen = orderNumber;
        if (seen.has(orderNumber)) continue;
        seen.add(orderNumber);
        unique.push(orderNumber);
        if (unique.length >= target + 1) break;
      }

      if (chunk.length < chunkSize || Number.isFinite(directNumber)) {
        exhausted = true;
      } else if (!Number.isFinite(lowestSeen)) {
        // Defensive guard for malformed/null-only chunks.
        exhausted = true;
      } else if (scanCursor !== null && lowestSeen >= scanCursor) {
        // Avoid an infinite loop if a backend/custom view ignores the cursor.
        exhausted = true;
      } else {
        scanCursor = lowestSeen;
      }
    }

    ok = true;
    status = 200;
    return {
      numbers: unique.slice(0, target),
      hasMore: unique.length > target || !exhausted,
    };
  } catch (error) {
    status = statusFromError(error);
    throw error;
  } finally {
    recordPerformanceSample({
      category: "orders-pagination",
      name: scanProfileName,
      durationMs: performance.now() - startedAt,
      ok,
      status,
      meta: {
        requests,
        rows: scannedRows,
        groups: unique.length,
        keyset: true,
        exhausted,
      },
    });
  }
}

/**
 * Load all component rows for a set of already-selected order numbers.
 * The helper keeps the existing PostgREST offset paging only inside the small
 * `IN (...)` batch where it is bounded and necessary to avoid a server-side
 * max-row cap truncating large orders.
 */
export async function loadOrderRowsByNumbers({
  table,
  numbers = [],
  selectExpr = "*",
  extraParams = {},
  order = "order_number.desc,notion_created_time.desc,id.desc",
  batchSize = 24,
  rowChunk = 1000,
  maxRowsPerBatch = 50000,
  queryProfileName = "orders.summary",
  fallbackProfileName = "orders.summary-fallback",
  loadProfileName = "orders.summary-load",
} = {}) {
  const clean = cleanOrderNumbers(numbers);
  if (!clean.length) return [];

  const safeBatchSize = positiveInteger(batchSize, 24, 1, 100);
  const chunkSize = positiveInteger(rowChunk, 1000, 100, 5000);
  const batchBudget = positiveInteger(maxRowsPerBatch, 50000, chunkSize, 250000);
  const out = [];
  const startedAt = performance.now();
  let requests = 0;
  let usedFallback = false;
  let projectionSupported = Boolean(selectExpr && selectExpr !== "*");
  let ok = false;
  let status = 0;

  try {
    for (let index = 0; index < clean.length; index += safeBatchSize) {
      const batch = clean.slice(index, index + safeBatchSize);
      let offset = 0;
      let useProjection = projectionSupported;

      while (offset < batchBudget) {
        const baseParams = {
          order_number: `in.(${batch.join(",")})`,
          order,
          limit: String(chunkSize),
          offset: String(offset),
          ...(extraParams || {}),
        };

        let rows;
        requests += 1;
        if (useProjection) {
          try {
            rows = await select(table, { ...baseParams, select: selectExpr }, { profileName: queryProfileName });
          } catch {
            usedFallback = true;
            useProjection = false;
            projectionSupported = false;
            requests += 1;
            rows = await select(table, { ...baseParams, select: "*" }, { profileName: fallbackProfileName });
          }
        } else {
          rows = await select(table, { ...baseParams, select: "*" }, { profileName: fallbackProfileName });
        }

        const chunk = Array.isArray(rows) ? rows : [];
        out.push(...chunk);
        if (chunk.length < chunkSize) break;
        offset += chunk.length;
      }
    }

    ok = true;
    status = 200;
    return out;
  } catch (error) {
    status = statusFromError(error);
    throw error;
  } finally {
    recordPerformanceSample({
      category: "orders-pagination",
      name: loadProfileName,
      durationMs: performance.now() - startedAt,
      ok,
      status,
      meta: {
        requests,
        rows: out.length,
        groups: clean.length,
        fallback: usedFallback,
      },
    });
  }
}

export const __orderPaginationTest = {
  exactOrderNumberFilter,
  finiteNumber,
  cleanOrderNumbers,
};
