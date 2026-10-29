import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {filterProductionReceivingRows} from "../lib/preparing-production-math.mjs";
const require=createRequire(import.meta.url);
const ts=require("typescript");

const records=[
 {id:"available-unreceived",warehouseReceived:2,productionReceived:0,availableToProduction:2},
 {id:"partly-received",warehouseReceived:5,productionReceived:3,availableToProduction:2},
 {id:"fully-received",warehouseReceived:2,productionReceived:2,availableToProduction:0},
 {id:"not-in-warehouse",warehouseReceived:0,productionReceived:0,availableToProduction:0},
];

test("default Production Receiving filter displays only quantities available to receive",()=>{
 assert.deepEqual(filterProductionReceivingRows(records).map(r=>r.id),["available-unreceived","partly-received"]);
 assert.deepEqual(filterProductionReceivingRows(records,"available").map(r=>r.id),["available-unreceived","partly-received"]);
});
test("Not Received displays components with zero Production receipts",()=>{
 assert.deepEqual(filterProductionReceivingRows(records,"not-received").map(r=>r.id),["available-unreceived","not-in-warehouse"]);
});
test("All components retains full stock list and filtering does not change row values",()=>{
 assert.deepEqual(filterProductionReceivingRows(records,"all"),records);
 assert.deepEqual(filterProductionReceivingRows([],"available"),[]);
 assert.deepEqual(filterProductionReceivingRows(undefined,"not-received"),[]);
});
test("Production Receiving page defaults to Available to Receive and offers Not Received",()=>{
 const source=readFileSync(new URL("../components/preparing/ProjectProductionReceiving.jsx",import.meta.url),"utf8");
 assert.match(source,/\[filter,setFilter\]=useState\("available"\)/);
 assert.match(source,/filterProductionReceivingRows\(/);
 assert.match(source,/<option value="not-received">Not Received<\/option>/);
 assert.match(source,/<option value="all">All components<\/option>/);
 const parsed=ts.createSourceFile("ProjectProductionReceiving.jsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics,[]);
});
