// Serializable, dependency-free input policy for the optional SQL transaction.
// The SQL function compares this snapshot against the locked database rows.
const string = value => String(value ?? '').trim();
const MAX_ROWS = 999;
const watchedColumns = [
  'status', 'team_member_id', 'team_member_name',
  'quantity_requested', 'quantity_progress', 'quantity_remaining',
  'quantity_received_by_operations', 'quantity_edited_by_supervisor',
];

export function buildAtomicOrderActionRequest({ action, ids, rows, orderNumber } = {}) {
  if (!['archive', 'unarchive', 'delete'].includes(action)) throw new Error('Invalid atomic order action.');
  const selected = Array.isArray(ids) ? ids.map(string) : [];
  if (!selected.length || selected.length > MAX_ROWS || selected.some(id => !/^\d+$/.test(id))) {
    throw new Error('Invalid atomic order component IDs.');
  }
  if (new Set(selected).size !== selected.length) throw new Error('Duplicate atomic order component IDs.');
  const number = string(orderNumber);
  if (!/^\d+$/.test(number)) throw new Error('Invalid atomic order number.');
  if (!Array.isArray(rows) || rows.length !== selected.length) throw new Error('Atomic order snapshot is incomplete.');
  const idSet = new Set(selected);
  const expected = Object.create(null);
  for (const row of rows) {
    const id = string(row?.id);
    if (!idSet.has(id) || Object.hasOwn(expected, id) || string(row?.order_number) !== number) {
      throw new Error('Atomic order snapshot does not match the selected order.');
    }
    expected[id] = Object.fromEntries(watchedColumns.map(key => [key, row?.[key] ?? null]));
  }
  if (Object.keys(expected).length !== selected.length) throw new Error('Atomic order snapshot is incomplete.');
  return { p_order_number: number, p_ids: selected, p_action: action, p_expected: expected };
}
