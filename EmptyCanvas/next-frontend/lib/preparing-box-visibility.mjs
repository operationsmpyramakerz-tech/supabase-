/** Show only Production items with a positive unboxed balance in the packing queue.
 * Packed boxes and their histories are deliberately retained elsewhere. */
export const packableRows = rows => (Array.isArray(rows)?rows:[]).filter(row =>
  Number(row.productionReceived) > 0 && Number(row.unpacked) > 0
);

/** Filter packing visibility without changing carton lines, stock balances or history.
 * Default: queue with unpacked stock. All: include fully packed and
 * not-yet-received components for auditing/correction; Packed: items in boxes. */
export function filterBoxDistributionRows(rows,filter="available"){
 const items=Array.isArray(rows)?rows:[];
 if(filter==="available")return packableRows(items);
 if(filter==="packed")return items.filter(r=>Number(r.packedQty)>0);
 if(filter==="all")return items;
 return [];
}
