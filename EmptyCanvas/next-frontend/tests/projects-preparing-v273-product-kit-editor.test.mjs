import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {filterPreparingProductOptions} from '../lib/preparing-product-options.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript'),postcss=require('postcss');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const main=read('components/preparing/ProjectMasterComponents.jsx');
const picker=read('components/preparing/ProjectProductPicker.jsx');
const css=read('public/css/projects-preparing.css');
const service=read('lib/preparing-warehouse.js');
const route=read('app/api/projects-preparing/product-options/route.js');

test('all kit components are shown; no preview limit or View All toggle',()=>{
 assert.match(main,/const shownItems=group\.items/);
 assert.doesNotMatch(main,/View all components|Show fewer|fullGroups|slice\(0,3\)/);
 assert.match(main,/group\.items\.length\)} total/);
});
test('Edit Qty uses same-row input and Save Cancel replacement, with optimistic total',()=>{
 assert.match(main,/className="pr-pbom-inline-qty"/);
 assert.match(main,/aria-label=\{`Kit quantity for/);
 assert.match(main,/\?\<\>\<button type="button" className="pr-primary"[^>]*onClick=\{saveEditor\}/);
 assert.doesNotMatch(main,/Edit Kit quantity/);
 assert.match(main,/onKeyDown=\{e=>\{if\(e\.key==="Enter"\)/);
});
test('product additions use a real selected catalog item and no manual Product code',()=>{
 assert.match(main,/ProjectProductPicker/);
 assert.match(main,/productCatalogId:editor\.kind==="add"\?selectedProduct\.id:null/);
 assert.doesNotMatch(main,/kitFirstProduct|Create Kit with first component/);
 assert.doesNotMatch(main,/newCode|kitFirstCode|Product code<input/);
 assert.match(service,/import \{ getProduct \} from "\.\/products-service"/);
 assert.match(service,/await getProduct\(catalogId\)/);
 assert.match(service,/catalogProduct\.displayId/);
 assert.match(route,/"preparing\.manage"/);
 assert.match(route,/"Cache-Control":"private, no-store"/);
});
test('product-options only expose minimal canonical fields and search by code or name',()=>{
 const rows=[
  {id:'p1',name:'Arduino UNO',displayId:'A100010',unitPrice:500},
  {id:'p2',name:'Resistor',displayId:'A300021',unitPrice:2},
  {id:'p3',name:'Arduino Cable',displayId:'A100011',unitPrice:100},
 ];
 assert.deepEqual(filterPreparingProductOptions(rows,'A100010'),[{id:'p1',name:'Arduino UNO',displayId:'A100010'}]);
 assert.equal(filterPreparingProductOptions(rows,'arduino').length,2);
 assert.equal(filterPreparingProductOptions(rows,'nonexistent').length,0);
 assert.equal(filterPreparingProductOptions(rows,'',1).length,1);
 assert.deepEqual(Object.keys(filterPreparingProductOptions(rows,'A300021')[0]).sort(),['displayId','id','name']);
});
test('custom picker has first search field, keyboard navigation and mobile bottom layout',()=>{
 assert.match(picker,/type="search"/);
 assert.match(picker,/role="listbox"/);
 assert.match(picker,/keySearch/);
 assert.match(picker,/AbortController/);
 assert.match(picker,/next\/api\/projects-preparing\/product-options/);
 assert.match(picker,/createPortal/);
 assert.match(css,/\.pr-product-picker-menu\.is-above/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/\.pr-pbom--modern \.pr-kit-group-add\s*\{[^}]*background:#111111/);
});
test('modified JSX and CSS parse and cache-busting version is updated',()=>{
 for(const [file,source] of [['ProjectMasterComponents.jsx',main],['ProjectProductPicker.jsx',picker]]){
  const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],`${file} has syntax errors`);
 }
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.match(read('app/projects-preparing/page.jsx'),/projects-preparing\.css\?v=274/);
});
