/**
 * Build exact, ordered order slices from a single Supabase detail snapshot.
 * Never silently omit missing or duplicated rows: the combined Excel/PDF
 * export must have all source components before merging any quantities.
 */
export function mapSelectedCombinedOrderItems(groups = [], items = []) {
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.id ?? "").trim();
    if (!id || byId.has(id)) {
      const error = new Error("Combined orders export stopped: Duplicate or unidentified order components were retrieved.");
      error.status = 409;
      throw error;
    }
    byId.set(id, item);
  }

  const seen = new Set();
  const grouped = (Array.isArray(groups) ? groups : []).map((group) => {
    const ids = Array.isArray(group?.orderIds) ? group.orderIds : [];
    return ids.map((rawId) => {
      const id = String(rawId ?? "").trim();
      const item = byId.get(id);
      if (!id || seen.has(id) || !item) {
        const error = new Error("Combined orders export stopped: At least one selected component was missing or duplicated. Please retry.");
        error.status = 409;
        throw error;
      }
      seen.add(id);
      return item;
    });
  });
  if (seen.size !== byId.size) {
    const error = new Error("Combined orders export stopped: Retrieved components do not match the selected orders.");
    error.status = 409;
    throw error;
  }
  return grouped;
}
