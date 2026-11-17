import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPublicExpenseOrders, publicOrderStage } from '../lib/expense-public-order-template.mjs';
const products=[{orderId:'ORD-150',orderType:'Request Products',productName:'Paint',productTag:'Materials',quantity:4,unitPrice:10,status:'Under Supervision',createdTime:'2026-11-17',reason:'For curriculum projects',priorityLevel:'Urgent',requestedDeliveryDate:'2026-11-24'}, {orderId:'ORD-150',orderType:'Request Products',productName:'Clay',productTag:'Materials',quantity:2,unitPrice:65,status:'Shipping',createdTime:'2026-11-15',reason:'For curriculum projects'}];
const maintenance={orderId:'ORD-129',orderType:'Request Maintenance',productName:'3D Printer - machine',productId:'A400010',createdByName:'Example School',createdById:'PRIVATE-ID',status:'In progress',createdTime:'2026-11-09',issueDescription:'Initial issue text',reason:'Old reason',unitPrice:41000,quantity:1,maintenanceLogs:[{serialNumber:'12345',technicianName:'Technician',loggedAt:'2026-11-16',resolutionMethod:'On-site',actualIssueDescription:'First issue',repairAction:'First repair',maintenanceChecklist:['Tested'],sparePartsNeededEntries:[{name:'Nozzle',qty:2,unitPrice:10}],sparePartsReplacedEntries:[]},{serialNumber:'12345',technicianName:'Technician',loggedAt:'2026-11-17',repairAction:'Second repair'}]};
function track(html){return html.match(/<div class="co-track-pill"[^]*?<\/div>/)[0];}
test('product template follows original summary, progress, reason, estimate, grouped cards order',()=>{
 const html=renderPublicExpenseOrders([products]);
 for(const text of ['Request Products','ORD-150','Created Date','15 Nov 2026','24 Nov 2026','Priority','class="priority urgent"','For curriculum projects','Estimate Total','EGP 170.00','Product Tag','Materials','Qty: 4','Under Supervision','Shipping']) assert.ok(html.includes(text),text);
 assert.ok(html.indexOf('<div class="metrics">')<html.indexOf('<div class="co-track-pill"'));
 assert.ok(html.indexOf('<div class="reason"')<html.indexOf('<div class="estimate"'));
 assert.ok(html.indexOf('<div class="estimate"')<html.indexOf('<div class="list-head"'));
 assert.ok(html.indexOf('<h3 dir="auto">Clay')<html.indexOf('<h3 dir="auto">Paint'));
 assert.match(html,/<section class="order request">/);
 assert.match(track(html),/step 3 of 4/);
});
test('progress mirrors the 4 icons, completed links and current ring for each status',()=>{
 for(const [status,n] of [['Under Supervision',1],['Approved',2],['In Progress',2],['Shipped',3],['Arrived',4],['Archived',4]]){
  const bar=track(renderPublicExpenseOrders([[{...products[0],status}]]));
  assert.match(bar,new RegExp(`step ${n} of 4`));
  assert.equal((bar.match(/class="co-track-step is-active/g)||[]).length,n);
  assert.equal((bar.match(/class="co-track-conn is-active/g)||[]).length,n-1);
  assert.equal((bar.match(/ is-current/g)||[]).length,1);
  assert.equal((bar.match(/<svg /g)||[]).length,4);
 }
 assert.equal(publicOrderStage('Completed',true),4);
});
test('maintenance uses original machine and separate log cards with no machine purchase total',()=>{
 const html=renderPublicExpenseOrders([[maintenance]]);
 for(const text of ['Request Maintenance','Team member','Example School','Machine details','Serial number','A400010','Initial issue text','Log One','Log Two','Technician name','16 Nov 2026','Maintenance action','Maintenance checklist','First issue','First repair','Second repair','Spare parts needed','Spare parts replaced','Nozzle','EGP 20.00']) assert.ok(html.includes(text),text);
 assert.match(html,/<section class="order maintenance">/);
 assert.match(track(html),/step 2 of 4/);
 assert.doesNotMatch(html,/PRIVATE-ID|EGP 41,000|<div class="reason"|<div class="estimate"/);
});
test('unlogged maintenance keeps machine and initial issue, does not fabricate logs',()=>{
 const html=renderPublicExpenseOrders([[{...maintenance,maintenanceLogs:[],status:'Not Started'}]]);
 assert.match(html,/Machine details/); assert.match(html,/Initial issue text/); assert.doesNotMatch(html,/<fieldset class="log-frame/); assert.match(track(html),/step 1 of 4/);
});
test('legacy log and all dynamic strings remain escaped; no private attachments, forms or scripts',()=>{
 const html=renderPublicExpenseOrders([[{...maintenance,maintenanceLogs:[],repairAction:'<img src=x onerror=alert(1)>',serialNumber:'<serial>',productUrl:'https://internal.invalid/private',receiptNumber:'PRIVATE-RECEIPT',orderReceiptUrls:['https://private.invalid/secret']}],[{...products[0],orderType:'Withdraw Products',productName:'<script>alert(1)</script>'}]]);
 assert.match(html,/Log One/); assert.match(html,/&lt;serial&gt;/); assert.match(html,/&lt;img src=x/); assert.match(html,/&lt;script&gt;/); assert.match(html,/<section class="order withdraw">/);
 assert.doesNotMatch(html,/<script|<img|<form|<button|PRIVATE-RECEIPT|internal\.invalid|private\.invalid|PRIVATE-ID/);
});
test('empty groups are skipped and unknown order types are displayed safely',()=>{
 const html=renderPublicExpenseOrders([[],[{...products[0],orderType:'constructor'}]]);
 assert.match(html,/<section class="order generic">/); assert.match(html,/<h1 dir="auto">constructor<\/h1>/);
});
