import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = path => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8');
const registrySrc = read('lib/feature-permissions-registry.js');
const registryUrl = `data:text/javascript;base64,${Buffer.from(registrySrc).toString('base64')}`;
const registry = await import(registryUrl);
const policySrc = read('lib/home-analysis-permissions.js').replace('./feature-permissions-registry', registryUrl);
const policy = await import(`data:text/javascript;base64,${Buffer.from(policySrc).toString('base64')}`);
const legacy = {id:'mine', teamMemberId:'mine', allowedPages: ['Expenses', 'Expenses Users']};
const grants = (values) => ({
  ...legacy, featureAccess: {mode:'enforced', grants:Object.fromEntries(Object.entries(values).map(([key,allowed])=>[key,{allowed,scope:'all'}]))}
});

test('Home is opt-in and feature keys are visible and registered', () => {
  assert.deepEqual(['home.view','home.analysis','home.financial_analysis'].map(key=>registry.ACTIVE_PILOT_FEATURE_KEYS.includes(key)),[true,true,true]);
  assert.ok(registry.PILOT_FEATURE_MODULES.includes('home'));
  assert.equal(policy.homeSelection(legacy,'other').allowed,true);
  assert.equal(policy.homeFinanceAllowed(legacy),true);
  assert.equal(policy.homeAdvanced(legacy),false);
});

test('Home View grant is prerequisite for all Home actions', () => {
  const viewDenied=grants({'home.view': false, 'home.analysis': true, 'home.financial_analysis': true});
  assert.equal(policy.homeSelection(viewDenied,'all').status,403);
  assert.equal(policy.homeTeamAnalysisAllowed(viewDenied),false);
  assert.equal(policy.homeFinanceAllowed(viewDenied),false);
});

test('View-only Home always resolves to own member and denies direct user URL', () => {
  const account=grants({'home.view':true});
  assert.deepEqual(policy.homeSelection(account,'all'), {allowed:true,userId:'mine',canSelectUsers:false});
  assert.deepEqual(policy.homeSelection(account,'mine'), {allowed:true,userId:'mine',canSelectUsers:false});
  assert.equal(policy.homeSelection(account,'other').status,403);
  assert.equal(policy.homeFinanceAllowed(account),false);
});

test('Team Analysis grant allows team filter without automatically granting finance', () => {
  const account=grants({'home.view':true,'home.analysis':true});
  assert.deepEqual(policy.homeSelection(account,'other'),{allowed:true,userId:'other',canSelectUsers:true});
  assert.equal(policy.homeFinanceAllowed(account),false);
});

test('Other member financials also require Expenses Users page and advanced grant', () => {
  const values={'home.view':true,'home.analysis':true,'home.financial_analysis':true,'expenses.users.view':true};
  assert.equal(policy.canHomeAccessOtherExpenses(grants(values)),true);
  assert.equal(policy.canHomeAccessOtherExpenses({...grants(values),allowedPages:['Expenses'],pageAccess:{pages:[]}}),false);
  assert.equal(policy.canHomeAccessOtherExpenses(grants({...values,'expenses.users.view':false})),false);
});

test('Home requests apply fresh gate and reject forbidden user selectors before data load',()=>{
  const page=read('app/home/page.jsx');
  const bootstrap=read('lib/page-bootstrap-direct.js');
  const data=read('lib/home-overview-data.js');
  assert.ok(page.indexOf('const freshGate = await getDirectAccountGateFromSessionContext')<page.indexOf('await loadHomeOverviewDirect({ account, requestedUserId'));
  assert.match(bootstrap,/if \(!selection.allowed\) return failure\(selection.status \|\| 403/);
  assert.match(data,/const selection = homeSelection\(account, requestedUserId\);/);
  assert.match(data,/!differentMember \|\| canHomeAccessOtherExpenses\(account\)/);
});

test('Home API endpoints refuse cross-user data without server-side grants',()=>{
  assert.match(read('app/api/home/analysis-users/route.js'),/homeTeamAnalysisAllowed\(gate.account\)/);
  assert.match(read('app/api/home/analysis-user-expenses/route.js'),/!homeTeamAnalysisAllowed\(gate.account\) \|\| !canHomeAccessOtherExpenses\(gate.account\)/);
  assert.match(read('app/api/home/stocktaking-user/route.js'),/userId !== String\(gate.memberId \|\| ""\) && !homeTeamAnalysisAllowed\(gate.account\)/);
  assert.doesNotMatch(read('components/home/HomeOverviewClient.jsx'), /sessionStorage\.getItem\("erp-home-analysis-users-v1"\)/);
  assert.match(read('components/AppShell.jsx'), /link.href === "\/next\/home"\) return featureAllowed\(account, "home.view"\)/);
});
