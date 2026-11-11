// Warehouse presentation only. Each physical stock ledger remains one row per product.
import {testingGroups} from "./preparing-project-testing-grouping.mjs";
const qty=v=>Number(v)||0;
export const WAREHOUSE_COLUMNS=[
 {key:"name",label:"Component",fixed:true},{key:"code",label:"Code"},
 {key:"required",label:"Project Required"},{key:"tested",label:"Tested"},{key:"accepted",label:"Returned"},
 {key:"available",label:"Ready to Return"},{key:"receivedBy",label:"Recorded By"},
 {key:"signature",label:"Signature"},
];
// Warehouse Return is ONLY for tested components, and the returned balance is
// the existing append-only warehouse receipt ledger. A partly returned item can
// be in both Ready to Return and Returned until its whole tested batch is back.
export function filterWarehouseReceivingRows(rows,filter="all"){
 const items=(Array.isArray(rows)?rows:[]).filter(row=>qty(row.tested)>0||qty(row.accepted)>0);
 if(filter==="available")return items.filter(row=>Math.max(0,qty(row.tested)-qty(row.accepted))>0);
 if(filter==="received")return items.filter(row=>qty(row.accepted)>0);
 if(filter==="all")return items;
 return [];
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
 if(key==="tested")return String(qty(row.tested));
 if(blank)return "";
 if(key==="remaining")return String(Math.max(0,qty(row.tested)-qty(row.accepted)));
 if(key==="receivedBy")return (row.receivedBy||[]).map(person=>person.name).join("; ");
 if(key==="available")return String(Math.max(0,qty(row.tested)-qty(row.accepted)));
 return String(qty(row[key]));
}
export function warehouseReceiptDelta(current,next){
 const value=Number(next);
 if(String(next).trim()===""||!Number.isSafeInteger(value)||value<0||value>1000000000)
  throw Error("Returned quantity must be a non-negative whole number.");
 const diff=value-qty(current);
 if(Math.abs(diff)>1000000)throw Error("Change cannot exceed 1,000,000 units in one transaction.");
 return diff;
}
