/** Show only Production items with a positive unboxed balance in the packing queue.
 * Packed boxes and their histories are deliberately retained elsewhere. */
export const packableRows = rows => (Array.isArray(rows)?rows:[]).filter(row =>
  Number(row.productionReceived) > 0 && Number(row.unpacked) > 0
);
