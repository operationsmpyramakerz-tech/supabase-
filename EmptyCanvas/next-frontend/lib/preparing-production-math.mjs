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
 if(value>warehouse)throw Error(`Production Received cannot exceed Warehouse Received (${warehouse}).`);
 if(value<packed)throw Error(`Production Received cannot be less than units packed into boxes (${packed}).`);
 const delta=value-current;
 if(Math.abs(delta)>1000000)throw Error("Change cannot exceed 1,000,000 units.");
 return delta;
}
