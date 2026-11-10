// Warehouse presentation only. Each physical stock ledger remains one row per product.
import {testingGroups} from "./preparing-project-testing-grouping.mjs";
const qty=v=>Number(v)||0;
export const WAREHOUSE_COLUMNS=[
 {key:"name",label:"Component",fixed:true},{key:"code",label:"Code"},
 {key:"required",label:"Required"},{key:"tested",label:"Tested"},{key:"accepted",label:"Received"},
 {key:"allocated",label:"Allocated"},{key:"available",label:"Available to Receive"},
 {key:"remaining",label:"Remaining"},{key:"receivedBy",label:"Received By"},
 {key:"signature",label:"Signature"},
];
// Received includes any positive net receipt, even when the item is partly received.
export function filterWarehouseReceivingRows(rows,filter="all"){
 const items=Array.isArray(rows)?rows:[];
 if(filter==="short")return items.filter(row=>row.accepted<row.required_qty);
 if(filter==="available")return items.filter(row=>row.readyToReceive>0);
 if(filter==="received")return items.filter(row=>Number(row.accepted)>0);
 return items;
}
export function warehouseGroups(rows=[],kitGroups=[]){
 return testingGroups(rows.map(row=>({
  ...row,name:row.product_name,code:row.product_id,required:qty(row.required_qty),
  sourceKits:Array.isArray(row.source_kits)?row.source_kits:[],
 })),kitGroups);
}
export function warehouseExportValue(row,key,blank=false){
 if(key==="signature")return "";
 if(key==="name")return row.name||"";
 if(key==="code")return row.code||"";
 if(key==="required")return String(qty(row.required));
 if(blank)return "";
 if(key==="remaining")return String(Math.max(0,qty(row.projectTotalRequired??row.required)-qty(row.accepted)));
 if(key==="receivedBy")return (row.receivedBy||[]).map(person=>person.name).join("; ");
 if(key==="available")return String(qty(row.readyToReceive??row.available));
 return String(qty(row[key]));
}
export function warehouseReceiptDelta(current,next){
 const value=Number(next);
 if(String(next).trim()===""||!Number.isSafeInteger(value)||value<0||value>1000000000)
  throw Error("Received quantity must be a non-negative whole number.");
 const diff=value-qty(current);
 if(Math.abs(diff)>1000000)throw Error("Change cannot exceed 1,000,000 units in one transaction.");
 return diff;
}
