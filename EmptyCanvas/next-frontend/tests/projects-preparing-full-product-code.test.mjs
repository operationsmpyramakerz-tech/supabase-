import test from 'node:test';
import assert from 'node:assert/strict';
import {preparingDisplayCodeResolver,withPreparingDisplayCodes,preparingDisplayCode} from '../lib/preparing-display-code.mjs';
import {testingExportValue} from '../lib/preparing-project-testing-grouping.mjs';
import {warehouseGroups,warehouseExportValue} from '../lib/preparing-warehouse-view.mjs';
const catalog=[{id:'72',name:'Battery - Coin Cell',displayId:'A100072'},{id:'73',name:'Battery - GP 9V',displayId:'A100073'},{id:'90',name:'Duplicate',displayId:'A100090'},{id:'91',name:'Duplicate',displayId:'A100091'}];
const resolve=preparingDisplayCodeResolver(catalog);
test('numeric internal product ID resolves to canonical full code, retaining leading zeroes',()=>{
 assert.equal(resolve(72,'Battery - Coin Cell'),'A100072');
 assert.equal(resolve('A100072','Battery - Coin Cell'),'A100072');
});
test('legacy stale codes resolve by unique exact name; ambiguous or unknown names are not guessed',()=>{
 assert.equal(resolve('old-72','Battery - Coin Cell'),'A100072');
 assert.equal(resolve('old','Duplicate'),'old');
 assert.equal(resolve('72','Unknown'),'72');
 assert.equal(preparingDisplayCodeResolver([])('72','Battery - Coin Cell'),'72');
});
test('display enrichment preserves stock and box identities and quantities',()=>{
 const source={id:'item-1',product_id:'72',product_name:'Battery - Coin Cell',required_qty:20,packed_qty:4};
 const [row]=withPreparingDisplayCodes([source],resolve);
 assert.deepEqual(row,{...source,displayCode:'A100072'});
 assert.equal(preparingDisplayCode(row),'A100072');
 assert.equal(source.displayCode,undefined);
});
test('testing/intake and warehouse export code stays complete in both report modes',()=>{
 const [t]=withPreparingDisplayCodes([{id:'item-1',code:'72',name:'Battery - Coin Cell',required:20}],resolve);
 const [w]=withPreparingDisplayCodes([{id:'item-1',product_id:'72',product_name:'Battery - Coin Cell',required_qty:20}],resolve);
 const grouped=warehouseGroups([w])[0].items[0];
 assert.equal(grouped.product_id,'72');
 for(const blank of [false,true]){
  assert.equal(testingExportValue(t,'code',blank),'A100072');
  assert.equal(warehouseExportValue(grouped,'code',blank),'A100072');
 }
});
