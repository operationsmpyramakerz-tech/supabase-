import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizePrForm, prInitialForm, PR_COLUMNS, PR_SIGNERS } from "../lib/purchase-requisition-data.mjs";
const read = p => fs.readFileSync(new URL(p, import.meta.url), "utf8");
test("initial PR uses requested quantities and never accidentally received counts", () => {
  const f = prInitialForm([{orderIdNumber:123,productName:"DC Motor",quantityRequested:5,quantityReceived:2,customizeId:"A100001",createdByName:"User",reason:"Prototype"}]);
  assert.equal(f.prNumber,"");assert.equal(f.workOrder,"ORD-123");assert.equal(f.items[0].quantity,"5");assert.equal(f.items[0].code,"A100001");assert.equal(f.items[0].description,"DC Motor");
});
test("all form sections and all signature roles are preserved", () => {
 const f=normalizePrForm({department:"Ops",priority:"عاجل",notes:"Purchase needed",items:[{description:"A"}],signatures:{technical:{name:"Technical reviewer"}}});
 assert.equal(f.department,"Ops");assert.equal(f.priority,"عاجل");assert.equal(f.notes,"Purchase needed");assert.equal(f.signatures.technical.name,"Technical reviewer");
 for(const role of PR_SIGNERS)assert.ok(f.signatures[role]);for(const key of PR_COLUMNS)assert.ok(key in f.items[0]);
});
test("form sanitizes control characters and places bounded limits",()=>{
 const f=normalizePrForm({department:"hello\u0000world",items:Array.from({length:1010},()=>({description:"A"}))});
 assert.equal(f.department,"helloworld");assert.equal(f.items.length,1000);
});
test("PR button only in Operations Orders modal",()=>{
 const modal=read("../components/orders/OperationsOrdersHeavyModals.jsx");
 const generic=read("../components/orders/OrderDownloadModal.jsx");
 assert.match(modal,/onPurchaseRequisition=\{permitted\("export"\)/);
 assert.match(generic,/Purchase Requisition/);
});
test("export route checks scope before generating files",()=>{
 const route=read("../app/api/orders/purchase-requisition/route.js");
 assert.ok(route.indexOf("assertOrderIdsInScope") < route.indexOf("renderPrWord(form)"));
 assert.match(route,/orders\.operations\.export/);
});
