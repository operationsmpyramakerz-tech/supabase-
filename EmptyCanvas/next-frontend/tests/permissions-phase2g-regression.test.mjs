import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const { featureAllowed, ACTIVE_PILOT_FEATURE_KEYS } = await import(`data:text/javascript;base64,${Buffer.from(src('../lib/feature-permissions-registry.js')).toString('base64')}`);
const user = grants => ({ featureAccess: { mode: 'enforced', grants } });
const grant = allowed => ({ allowed, scope: 'all' });

const modules = {
  stocktaking: ['view','export','add_row','edit_rows','start_inventory','update_inventory','authorize_column','upload_receipt'],
  expenses: ['view','cash_in','cash_out','settle','export','screenshot'],
  'expenses.users': ['view','edit','delete','export'],
};

test('Phase 2G modules have active, individually selectable features in Users Center', () => {
  const dialogs=src('../components/users-center/UsersCenterDialogs.jsx');
  for(const [module,actions] of Object.entries(modules)) {
    assert.ok(dialogs.includes(`{ key: "${module}", label:`),`missing UI module ${module}`);
    assert.ok(dialogs.includes(`"${module}": stored.some`) || dialogs.includes(`${module}: stored.some`));
    for(const action of actions) assert.ok(ACTIVE_PILOT_FEATURE_KEYS.includes(`${module}.${action}`), `${module}.${action}`);
  }
});

test('Old user grants continue until explicitly opted in; denied View blocks mutations', () => {
  const alreadyAdvanced=user({ 'kits.view': grant(true) });
  for(const [module,actions] of Object.entries(modules)) {
    assert.equal(featureAllowed(alreadyAdvanced, `${module}.${actions[1]}`),true);
    assert.equal(featureAllowed(user({ [`${module}.view`]: grant(false), [`${module}.${actions[1]}`]: grant(true) }), `${module}.${actions[1]}`),false);
    assert.equal(featureAllowed(user({ [`${module}.view`]: grant(true), [`${module}.${actions[1]}`]: grant(false) }), `${module}.${actions[1]}`),false);
    assert.equal(featureAllowed(user({ [`${module}.view`]: grant(true), [`${module}.${actions[1]}`]: grant(true) }), `${module}.${actions[1]}`),true);
  }
});

test('Stocktaking routes authenticate View, mutations dispatch granular gates', () => {
  for (const endpoint of ['../app/stocktaking/page.jsx','../app/api/stock/route.js','../app/api/stock/columns/route.js','../app/api/stock/products/route.js']) assert.ok(src(endpoint).includes('stocktaking.view'),endpoint);
  const mutation=src('../app/api/stock/mutations-direct/route.js');
  for(const action of ['authorize_column','add_row','edit_rows','start_inventory','update_inventory']) assert.ok(mutation.includes(`stocktaking.${action}`),action);
  assert.ok(mutation.indexOf('const actionGate = featureGate(') < mutation.indexOf('addStocktakingRow('));
  assert.ok(mutation.includes('const columnGate = featureGate(gate, "stocktaking.authorize_column")'));
  assert.ok(src('../app/api/stock/export-direct/route.js').includes('stocktaking.export'));
  assert.ok(src('../app/api/stock/receipt-upload/route.js').includes('stocktaking.upload_receipt'));
  const client=src('../components/stocktaking/StocktakingClient.jsx');
  for(const action of ['export','add_row','edit_rows','start_inventory','update_inventory','authorize_column','upload_receipt']) assert.ok(client.includes(`can("${action}")`),action);
});

test('Expenses actions including admin edit/delete are server gated and buttons conditional', () => {
  const route=src('../app/api/expenses/mutations-direct/route.js');
  for (const action of ['cash_in','cash_out','settle']) assert.ok(route.includes(`expenses.${action}`));
  for (const action of ['edit','delete']) assert.ok(route.includes(`expenses.users.${action}`));
  assert.ok(route.indexOf('const gate = featureGate(') < route.indexOf('createExpenseCashIn('));
  const client=src('../components/expenses/ExpensesClient.jsx');
  for (const action of ['cash_in','cash_out','settle','export','screenshot']) assert.ok(client.includes(`can("${action}")`));
  assert.ok(src('../components/expenses/ExpensesUsersDialogs.jsx').includes('permissions.delete ? beginDelete : null'));
  assert.ok(src('../components/expenses/ExpensesUsersDialogs.jsx').includes('permissions.export ? <button'));
});

test('Expenses screenshot checks session + owner; reports use authoritative expense data', () => {
  const screenshot=src('../app/api/expenses/screenshot-direct/route.js');
  const expenseData=src('../lib/expenses-data.js');
  assert.ok(expenseData.includes('featureAllowed(account, "expenses.screenshot")'));
  assert.ok(expenseData.includes('screenshots: [], screenshotUrl: "", screenshotName: ""'));
  assert.ok(screenshot.includes('getDirectAccountGate(["Expenses"])'));
  assert.ok(screenshot.includes('getDirectAccountGate(["Expenses Users"])'));
  assert.ok(screenshot.indexOf('ledger.items') < screenshot.indexOf('expenseScreenshotForId('));
  const exportRoute=src('../app/api/expenses/export-direct/route.js');
  assert.ok(exportRoute.includes('Unsupported expense export scope'));
  assert.ok(exportRoute.includes('expenses.users.export') && exportRoute.includes('expenses.export'));
  assert.ok(exportRoute.includes('rowsById.get(text(row.id))'));
  assert.ok(exportRoute.includes('items: selected,'));
});
