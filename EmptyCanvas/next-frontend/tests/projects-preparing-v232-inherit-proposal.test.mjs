import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ui = read('components/preparing/PreparingClient.jsx');
const service = read('lib/preparing-service.js');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const PROJECT_ID = '12345678-1234-4234-8234-123456789012';
const sourceId = 'proposal-for-project';
const memberId = 'school-1';
const extract = service.slice(service.indexOf('export async function addPreparingSchools('), service.indexOf('export async function updatePreparingStage(')).replace('export async function', 'async function');

function setup({projectProposal = sourceId, proposals = [{id: sourceId, name: '30 June'}], existing = []} = {}) {
  const writes = [];
  const bom=[{id:"12345678-1234-4234-8234-123456789013",item_key:"id:motor",product_id:"motor",product_name:"DC Motor",required_qty:3,source_kits:[{kitId:"g2",kitName:"G2",quantity:3}]}];
  const dependencies = {
    serviceOnly: () => {},
    identity: () => 'creator-1',
    requireProject: async () => ({source_proposal_id: projectProposal, source_proposal_name:'Original proposal name'}),
    clean: value => String(value ?? '').trim(),
    fail: (message, status = 400) => { const e = new Error(message); e.status = status; throw e; },
    preparingCatalog: async () => ({ members:[{id: memberId, name:'School One', school:'School One'}], proposals }),
    select: async (table) => table === "erp_preparing_warehouse_items" ? bom : existing.map(beneficiary_id => ({beneficiary_id})),
    uuid: id => id,
    SCHOOLS: 'erp_preparing_schools',
    rpc: async (name, payload) => {writes.push({name,payload}); return payload.p_schools.map(s=>({id:"school-row",proposal_id:sourceId,proposal_name:"Original proposal name",...s}));},
  };
  const names = Object.keys(dependencies);
  const add = new Function(...names, `${extract}\nreturn addPreparingSchools;`)(...Object.values(dependencies));
  return {add, writes};
}

test('Add Schools UI has school selection only; Create Project still chooses the Proposal', () => {
  const begin = ui.indexOf('{sheet === "schools" && <Sheet');
  const end = ui.indexOf('{sheet === "stage"', begin);
  assert.ok(begin >= 0 && end > begin);
  const schoolSheet = ui.slice(begin, end);
  assert.doesNotMatch(schoolSheet, /<select|setProposalId|proposalId,beneficiaryIds|!proposalId/);
  assert.match(schoolSheet, /projectId,beneficiaryIds:selectedMembers/);
  assert.match(schoolSheet, /!project\?\.source_proposal_id/);
  assert.match(schoolSheet, /Beneficiary users \/ schools/);
  assert.match(ui, /Source Proposal<select required value={projectSourceId}/);
  assert.doesNotMatch(ui, /const \[proposalId, setProposalId\]/);
});

test('server derives school Proposal from its parent project, not request body', async () => {
  const {add, writes} = setup();
  const result = await add(PROJECT_ID, {beneficiaryIds:[memberId]}, {id:'creator-1'});
  assert.equal(result.length,1);
  assert.equal(writes[0].name,"erp_preparing_add_schools_with_components");
  assert.equal(writes[0].payload.p_items.length,1);
  assert.equal(writes[0].payload.p_items[0].planned,3);
  assert.equal(writes[0].payload.p_items[0].sourceKits[0].kitName,"G2");
  assert.equal(writes[0].payload.p_schools[0].beneficiaryId,memberId);
  assert.equal(writes.length,1);
});

test('API cannot attach a different Proposal by forging proposalId', async () => {
  const {add, writes} = setup();
  await assert.rejects(add(PROJECT_ID,{proposalId:'other-proposal',beneficiaryIds:[memberId]},{id:'creator-1'}),
    /must match the project's source Proposal/);
  assert.equal(writes.length,0);
});

test('legacy projects without a source Proposal cannot add schools', async () => {
  const {add, writes} = setup({projectProposal:''});
  await assert.rejects(add(PROJECT_ID,{beneficiaryIds:[memberId]},{id:'creator-1'}),/Set a source Proposal/);
  assert.equal(writes.length,0);
});

test('unavailable source Proposal and duplicate school cannot create new rows', async () => {
  const missing = setup({proposals: []});
  await assert.rejects(missing.add(PROJECT_ID,{beneficiaryIds:[memberId]},{id:'creator-1'}),/no longer available/);
  assert.equal(missing.writes.length,0);
  const duplicate = setup({existing:[memberId]});
  await assert.rejects(duplicate.add(PROJECT_ID,{beneficiaryIds:[memberId]},{id:'creator-1'}),/already in this project/);
  assert.equal(duplicate.writes.length,0);
});

test('edited frontend JSX and service JS parse', () => {
  for (const name of ['components/preparing/PreparingClient.jsx','lib/preparing-service.js']) {
    const source = ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true, name.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
    assert.deepEqual(source.parseDiagnostics,[], name);
  }
});
