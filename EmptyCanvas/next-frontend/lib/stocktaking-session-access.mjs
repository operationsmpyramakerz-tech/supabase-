// Stocktaking inventory/defected session columns are globally stored on the
// Stocktaking table. A caller allowed to see a school folder must not be able
// to supply a different member's session column to a read, export or update.
// Sessions are created by startStocktakingInventory as:
//   `${owner.name} Inventory|Defected ${YYYY-MM-DD}`.
const text = (value) => String(value ?? '').normalize('NFKC').trim();

const columnKey = (value) => text(value)
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/%/g, ' percent ')
  .replace(/[’'"`]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/_+/g, '_');

export function sessionColumnBelongsToOwner(requestedColumn, ownerName, kind = '') {
  const column = columnKey(requestedColumn);
  const owner = columnKey(ownerName);
  if (!column || !owner) return false;
  const type = kind === 'inventory' ? 'inventory'
    : kind === 'defected' ? '(?:defected|defecated)'
    : '(?:inventory|defected|defecated)';
  const pattern = new RegExp(`^${owner}_${type}_(\\d{4})_(\\d{2})_(\\d{2})$`);
  const match = column.match(pattern);
  if (!match) return false;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function assertSessionColumnOwner({ inventoryColumn = '', defectedColumn = '', ownerName = '' } = {}) {
  const error = () => Object.assign(new Error('The selected Stocktaking session does not belong to this folder.'), { status: 403 });
  if (text(inventoryColumn) && !sessionColumnBelongsToOwner(inventoryColumn, ownerName, 'inventory')) throw error();
  if (text(defectedColumn) && !sessionColumnBelongsToOwner(defectedColumn, ownerName, 'defected')) throw error();
}

export function assertWritableSessionColumn({ sessionColumn = '', ownerName = '' } = {}) {
  if (!sessionColumnBelongsToOwner(sessionColumn, ownerName)) {
    throw Object.assign(new Error('The selected inventory session does not belong to this folder.'), { status: 403 });
  }
}
