import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prInitialForm,prApplyProductCatalog,normalizePrForm,safePrProductUrl} from '../lib/purchase-requisition-data.mjs';

const root=path.resolve(import.meta.dirname,'..');
const renderer=fs.readFileSync(path.join(root,'lib/purchase-requisition-render.js'),'utf8');
const page=fs.readFileSync(path.join(root,'app/operations-orders/purchase-requisition/page.jsx'),'utf8');
const ui=fs.readFileSync(path.join(root,'components/orders/PurchaseRequisitionClient.jsx'),'utf8');

test('uses canonical Products ID Code instead of customize ID or database ID',()=>{
 const rows=[{productId:'18',productName:'DC Motor',customizeId:'OLD-CUSTOM',quantityRequested:4,orderIdNumber:123,productUrl:'https://products.example/motor'}];
 const catalog=[{id:'18',displayId:'A100001',name:'DC Motor',url:'https://products.example/motor'}];
 const item=prInitialForm(rows,{},catalog).items[0];
 assert.equal(item.code,'A100001');
 assert.equal(item.url,'https://products.example/motor');
 assert.equal(item.quantity,'4');
 assert.notEqual(item.code,rows[0].productId);
});

test('loads canonical code and URL on opening saved form, preserving typed quantities and notes',()=>{
 const rows=[{productId:'18',productName:'DC Motor',quantityRequested:4}];
 const products=[{id:'18',displayId:'A100001',name:'DC Motor',url:'https://products.example/motor'}];
 const saved=normalizePrForm({notes:'لا تستبدل',items:[{code:'',description:'DC Motor',quantity:8}]});
 const merged=prApplyProductCatalog(saved,rows,products);
 assert.equal(merged.items[0].code,'A100001');
 assert.equal(merged.items[0].url,'https://products.example/motor');
 assert.equal(merged.items[0].quantity,'8');
 assert.equal(merged.notes,'لا تستبدل');
 assert.match(page,/getProductsForOrderDetails\(items\)/);
 assert.match(page,/prApplyProductCatalog\(prClearLegacyAutofilledNumber\(saved.form, form.workOrder\), items, products\)/);
});

test('rejects unsafe product links and does not invent a link on ambiguous catalog names',()=>{
 assert.equal(safePrProductUrl('javascript:alert(1)'),'');
 assert.equal(safePrProductUrl('file:///etc/passwd'),'');
 assert.equal(safePrProductUrl('https://person:secret@example.com/'),'');
 const saved=normalizePrForm({items:[{description:'Unknown',url:'javascript:alert(1)'}]});
 assert.equal(saved.items[0].url,'');
 const catalog=[{id:'1',name:'Motor',displayId:'A1'},{id:'2',name:'Motor',displayId:'A2'}];
 assert.equal(prApplyProductCatalog(normalizePrForm({items:[{description:'Motor'}]}),[],catalog).items[0].code,'');
});

test('Word and PDF attach external hyperlinks to product descriptions',()=>{
 assert.match(renderer,/relationships\/hyperlink/);
 assert.match(renderer,/TargetMode="External"/);
 assert.match(renderer,/w:hyperlink r:id/);
 assert.match(renderer,/doc\.link\(xx\+2,y\+2,ww-4,h-4,safePrProductUrl\(productUrl\)\)/);
 assert.match(ui,/pr-product-link/);
 assert.match(ui,/noopener noreferrer/);
});

test('PDF trims row heights and visually centers Arabic slashes and parentheses',()=>{
 assert.match(renderer,/function pairRow\(labelRight,valueRight,labelLeft,valueLeft,y,h=32\)/);
 assert.match(renderer,/Math\.max\(29,/);
 assert.match(renderer,/const tableHead=\(\)=>\{y=itemRow\(titles,y,35,true\);\}/);
 assert.match(renderer,/isolatedPunctuation/);
 assert.match(renderer,/size\*\.14/);
 assert.match(renderer,/align:"center",maxLines:2/);
});
