/**
 * PostgREST's configured max_rows can silently cap a response even when the
 * request's `limit` is higher. Request deliberately small, ordered pages and
 * stop only after receiving a short page. This is shared by the Stocktaking
 * table/detail/export paths, without changing global selectAll behavior.
 */
export const STOCKTAKING_PAGE_SIZE = 500;
const MAX_STOCKTAKING_PAGES = 200;

export async function readAllStocktakingPages(readPage, { pageSize = STOCKTAKING_PAGE_SIZE } = {}) {
  if (typeof readPage !== "function") throw new TypeError("A Stocktaking page reader is required.");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > STOCKTAKING_PAGE_SIZE) {
    throw new RangeError(`Stocktaking page size must be between 1 and ${STOCKTAKING_PAGE_SIZE}.`);
  }
  const all = [];
  for (let pageIndex = 0; pageIndex < MAX_STOCKTAKING_PAGES; pageIndex += 1) {
    const page = await readPage({ offset: pageIndex * pageSize, limit: pageSize });
    if (!Array.isArray(page) || page.length > pageSize) {
      throw new Error("Stocktaking returned an invalid pagination response.");
    }
    all.push(...page);
    if (page.length < pageSize) return all;
  }
  throw new Error("Stocktaking result exceeds the supported pagination range; no partial data was returned.");
}
