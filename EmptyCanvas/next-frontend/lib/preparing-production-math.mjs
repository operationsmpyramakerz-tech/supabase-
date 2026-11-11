// Side-effect-free production handover arithmetic. Authoritative checks are also in SQL.
const amount=v=>Number(v)||0;
export function productionBalance(warehouseReceived,productionReceived,packedQty){
 const warehouse=amount(warehouseReceived),received=amount(productionReceived),packed=amount(packedQty);
 return {warehouseReceived:warehouse,productionReceived:received,packedQty:packed,
  availableToProduction:Math.max(0,warehouse-received),unpacked:Math.max(0,received-packed)};
}
export function productionReceiptDelta(current,next,warehouse,packed){
 const value=Number(next);
 if(String(next).trim()===""||!Number.isSafeInteger(value)||value<0||value>1000000000)throw Error("Enter a non-negative whole number.");
 if(value>warehouse)throw Error(`Operations Received cannot exceed Warehouse Returned (${warehouse}).`);
 if(value<packed)throw Error(`Operations Received cannot be less than units packed into boxes (${packed}).`);
 const delta=value-current;
 if(Math.abs(delta)>1000000)throw Error("Change cannot exceed 1,000,000 units.");
 return delta;
}

// The chosen carton stores a quantity; packing elsewhere stays untouched.
export function boxPackingTarget(productionReceived,totalPacked,packedInSelectedBox,nextValue){
 const raw=String(nextValue);
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>1000000)throw Error("Packed must be a non-negative whole number up to 1,000,000.");
 const target=Number(raw);
 const nextTotal=Number(totalPacked)-Number(packedInSelectedBox)+target;
 if(nextTotal>Number(productionReceived))throw Error(`Packed quantity cannot exceed Operations Received (${productionReceived}).`);
 if(nextTotal<0)throw Error("Packed total cannot be negative.");
 return {packed:nextTotal,unpacked:Number(productionReceived)-nextTotal};
}

// Operations Receiving filters: available stock from Warehouse is the default.
// "Not Received" means no Operations handover has ever been recorded for the
// component; it intentionally includes items not yet available from Warehouse.
export function filterProductionReceivingRows(rows,filter="available"){
 const items=Array.isArray(rows)?rows:[];
 if(filter==="available")return items.filter(row=>Number(row.availableToProduction)>0);
 if(filter==="not-received")return items.filter(row=>Number(row.productionReceived??0)===0);
 if(filter==="received")return items.filter(row=>Number(row.productionReceived)>0);
 return items;
}
