import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { assertShoppingCartSources } from '../lib/shopping-cart-source-policy.mjs';

const registrySource = fs.readFileSync(new URL('../lib/feature-permissions-registry.js', import.meta.url), 'utf8');
const registry = await import(`data:text/javascript;base64,${Buffer.from(registrySource).toString('base64')}`);
const grant = allowed => ({ allowed, scope:'all' });
const account = (options = {}) => ({ featureAccess: { mode: 'enforced', grants: {
  'orders.shopping.view': grant(options.view !== false),
  'orders.shopping.submit': grant(true),
  'orders.shopping.sources.__granular': grant(options.granular === true),
  'orders.shopping.source.components': grant(options.components === true),
  'orders.shopping.source.kits': grant(options.kits === true),
} } });
const source = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

const availableKits = new Map([
  ['kit-one', { items: [{ productId:'p1' }, { productId:'p2' }] }],
  ['kit-two', { items: [{ productId:'p2' }, { productId:'p3' }] }],
]);
const lookupKit = async id => {
  if (!availableKits.has(id)) throw Object.assign(new Error('Kit not found'), { status: 404 });
  return availableKits.get(id);
};

const validate = options => assertShoppingCartSources({
  orderType: 'Request Products', products: [{id:'p1',kitSourceIds:['kit-one']}], getKit:lookupKit, ...options,
});

test('new source keys appear in Users Center and registry', () => {
  for (const key of ['orders.shopping.sources.__granular','orders.shopping.source.components','orders.shopping.source.kits']) {
    assert.equal(registry.isKnownFeature(key), true, key);
    assert.ok(registry.ACTIVE_PILOT_FEATURE_KEYS.includes(key), key);
  }
  const users = source('../components/users-center/UsersCenterDialogs.jsx');
  assert.match(users, /individual Shopping Cart source permissions/);
  assert.match(users, /orders\.shopping\.sources\.__granular/);
});

test('legacy users and previously migrated shopping accounts remain unchanged', () => {
  assert.equal(registry.shoppingSourceAllowed({featureAccess:{mode:'legacy'}},'components'), true);
  assert.equal(registry.shoppingSourceAllowed({featureAccess:{mode:'legacy'}},'kits'), true);
  for (const choice of ['components','kits']) assert.equal(registry.shoppingSourceAllowed(account({granular:false}), choice), true);
  const historical = {featureAccess:{mode:'enforced',grants:{'orders.shopping.view':grant(true)}}};
  assert.equal(registry.shoppingSourceAllowed(historical,'kits'), true);
});

test('granular mode independently allows component or kit and rejects without Shopping View', () => {
  const onlyKit = account({granular:true,kits:true});
  assert.equal(registry.shoppingSourceAllowed(onlyKit,'components'),false);
  assert.equal(registry.shoppingSourceAllowed(onlyKit,'kits'),true);
  const onlyComponent = account({granular:true,components:true});
  assert.equal(registry.shoppingSourceAllowed(onlyComponent,'components'),true);
  assert.equal(registry.shoppingSourceAllowed(onlyComponent,'kits'),false);
  assert.equal(registry.shoppingSourceAllowed(account({granular:true,components:true,kits:true,view:false}),'kits'),false);
});

test('Kits-only submit checks real membership and rejects unsigned/freehand component choices', async () => {
  await validate({allowComponents:false,allowKits:true});
  await assert.rejects(validate({allowComponents:false,allowKits:true,products:[{id:'p9',kitSourceIds:['kit-one']}]}),{status:403});
  await assert.rejects(validate({allowComponents:false,allowKits:true,products:[{id:'p1'}]}),{status:403});
  await assert.rejects(validate({allowComponents:false,allowKits:true,products:[{id:'p2',kitSourceIds:['kit-one','kit-two']},{id:'p3',kitSourceIds:['kit-one']}]}),{status:403});
  await assertShoppingCartSources({orderType:'Withdraw Products',allowComponents:false,allowKits:true,products:[{id:'p2',kitSourceIds:['kit-one','kit-two']}],getKit:lookupKit});
});

test('Components-only reject kit sources and maintenance is unaffected', async () => {
  await assert.rejects(validate({allowComponents:true,allowKits:false}),{status:403});
  await validate({allowComponents:true,allowKits:false,products:[{id:'p1'}]});
  await assert.rejects(assertShoppingCartSources({ orderType:'Other Order Type', allowComponents:false, allowKits:true, products:[{id:'p1'}], getKit:lookupKit }), {status:403});
  await assertShoppingCartSources({orderType:'Request Maintenance',allowComponents:false,allowKits:false,products:[{id:'p1'}],getKit:lookupKit});
  await assert.rejects(validate({allowComponents:false,allowKits:false}),{status:403});
});

test('client, server page and submit endpoint wire permissions end-to-end', () => {
  const page=source('../components/orders/ShoppingCartPageServer.jsx');
  assert.match(page,/shoppingSourceAllowed\(gate\.account, "components"\)/);
  assert.match(page,/shoppingSourceAllowed\(gate\.account, "kits"\)/);
  const cart=source('../components/orders/ShoppingCartClient.jsx');
  assert.match(cart,/kitSourceIds: item\.kitSourceIds/);
  assert.match(cart,/kitSourceIds: \[kitId\]/);
  assert.match(cart,/allowComponents=\{allowComponents\}/);
  assert.match(cart,/allowKits=\{allowKits\}/);
  const picker=source('../components/orders/ShoppingCartDialogs.jsx');
  assert.match(picker,/allowComponents && allowKits/);
  assert.match(picker,/!allowComponents && allowKits \? "kit"/);
  const api=source('../app/api/orders/shopping-cart/submit-direct/route.js');
  assert.ok(api.indexOf('await assertShoppingCartSources') < api.indexOf('await submitShoppingCartOrderDirect'));
});
