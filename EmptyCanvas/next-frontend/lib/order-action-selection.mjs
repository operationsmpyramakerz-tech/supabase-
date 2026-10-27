// Pure guard for order-wide mutations. The UI supplies component IDs, but
// neither the browser nor a signed-in caller is trusted to supply ALL of them.
const clean = value => String(value ?? "").trim();

export function isCompleteOrderSelection(selectedIds, selectedRows, savedRows, { maxRows = 1000 } = {}) {
  if (!Array.isArray(selectedIds) || !Array.isArray(selectedRows) || !Array.isArray(savedRows)) return false;
  if (!selectedIds.length || selectedIds.length >= maxRows || selectedRows.length !== selectedIds.length) return false;
  if (!savedRows.length || savedRows.length >= maxRows) return false;
  const requested = selectedIds.map(clean);
  if (requested.some(id => !id) || new Set(requested).size !== requested.length) return false;
  const selectedById = new Map(selectedRows.map(row => [clean(row?.id), row]));
  if (selectedById.size !== requested.length || requested.some(id => !selectedById.has(id))) return false;
  const numbers = new Set(selectedRows.map(row => clean(row?.order_number)));
  if (numbers.size !== 1 || !/^\d+$/.test([...numbers][0])) return false;
  const number = [...numbers][0];
  const savedIds = new Set();
  for (const row of savedRows) {
    const id = clean(row?.id);
    if (!id || clean(row?.order_number) !== number || savedIds.has(id)) return false;
    savedIds.add(id);
  }
  return savedIds.size === requested.length && requested.every(id => savedIds.has(id));
}
