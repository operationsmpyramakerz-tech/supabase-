/**
 * Concurrent bounded reads with exact primary-key completeness verification.
 * One missing, duplicate, or unexpected component means NO export is returned.
 */
export async function loadVerifiedOrderBatches(ids, loader, { batchSize = 80, concurrency = 3 } = {}) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean))];
  if (!clean.length) return [];
  const pages = [];
  const batches = [];
  for (let start = 0; start < clean.length; start += batchSize) {
    batches.push(clean.slice(start, start + batchSize));
  }
  const workers = Array.from({ length: Math.min(concurrency, batches.length) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < batches.length; index += concurrency) {
      const batch = batches[index];
      const response = await loader(batch);
      if (!Array.isArray(response) || response.length !== batch.length) {
        const error = new Error("Order components could not be fully retrieved. The export was cancelled.");
        error.status = 502;
        throw error;
      }
      pages[index] = response;
    }
  });
  await Promise.all(workers);
  const rows = pages.flat();
  const idsSet = new Set(clean);
  const returned = new Set();
  for (const row of rows) {
    const id = String(row?.id ?? row?.ID ?? "").trim();
    if (!idsSet.has(id) || returned.has(id)) {
      const error = new Error("Order components changed during loading. Please retry to avoid an incorrect export.");
      error.status = 409;
      throw error;
    }
    returned.add(id);
  }
  if (returned.size !== clean.length) {
    const error = new Error("One or more order components could not be found. No partial data was returned.");
    error.status = 404;
    throw error;
  }
  return rows;
}
