import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachProjectResources } from '../lib/event-project-cards.mjs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const catalog = [
  { id:'p1', category:'project', name:'3D printer', photoUrl:'https://example.test/3d.jpg', description:'Printing', defaultQuantity:99, unitCost:9999, isActive:true, ownershipType:'company_owned' },
  { id:'p2', category:'project', name:'Buzz wire', photoUrl:'https://example.test/buzz.jpg', isActive:false, ownershipType:'external_rental' },
  { id:'x1', category:'marketing_material', name:'Buzz wire', photoUrl:'https://example.test/wrong.jpg' },
];
test('legacy titles match unique Project Resource names and retain the actual requested quantity',()=>{
  const rows=[{title:'  3D PRINTER ',quantity:2,workingCost:7,notes:'Preserve notes'},{title:'Buzz wire',quantity:1}];
  const result=attachProjectResources(rows,catalog);
  assert.equal(result[0].resource.photoUrl,catalog[0].photoUrl);
  assert.equal(result[0].quantity,2);
  assert.equal(result[0].workingCost,7);
  assert.equal(result[0].notes,'Preserve notes');
  assert.equal(result[1].resource.isActive,false);
  assert.equal(result[1].resource.ownershipType,'external_rental');
  assert.equal(result[0].resource.unitCost,undefined);
  assert.equal(result[0].resource.defaultQuantity,undefined);
  assert.equal(rows[0].resource,undefined);
});
test('component ID takes precedence over title; missing IDs and ambiguous legacy names fail safely',()=>{
  const result=attachProjectResources([{componentId:'p1',title:'Old name',quantity:3},{componentId:'removed',title:'3D printer'},{title:'3D printer'},{title:'Unlisted'},{componentId:'x1',title:'Buzz wire'}],[...catalog,{...catalog[0],id:'p3'}]);
  assert.equal(result[0].resource.photoUrl,catalog[0].photoUrl);
  assert.ok(result.slice(1).every(row=>!row.resource));
  assert.deepEqual(attachProjectResources([],catalog),[]);
});
test('only enrich a scoped full-detail request and preserve component IDs on new writes',()=>{
  const api=read('app/api/events/[id]/route.js');
  assert.ok(api.indexOf('await assertEventRequestScope')<api.indexOf('event.projects = attachProjectResources'));
  assert.match(api,/if \(!calendar && new URL\(request.url\).searchParams.get\("projectCards"\) === "1"/);
  assert.match(api,/calendar \? eventCalendarSummary\(event\)/);
  assert.match(read('lib/events-data.js'),/function normalizeProjects[\s\S]*?componentId: uuid\(row\?\.componentId \|\| row\?\.component_id\) \|\| null/);
  assert.match(read('components/events/EventsCalendarClient.jsx'),/canOpenRequests \? "projectCards=1&" : "view=calendar&"/);
});
test('calendar cards use event quantity, a photo fallback, no cost, and no catalog mutation controls',()=>{
  const jsx=read('components/events/EventsDialogs.jsx');
  const cards=jsx.split('function ProjectResourceCards')[1].split('const DETAIL_TABS')[0];
  assert.match(cards,/Required qty\.<\/small><strong>\{number\(project.quantity\)\}/);
  assert.match(cards,/ProjectResourcePhoto/);
  assert.match(jsx,/photo && !failed \? <img[\s\S]*?onError=\{\(\) => setFailed\(true\)\}[\s\S]*?<EventIcon name="box"/);
  assert.doesNotMatch(cards,/workingCost|unitCost|defaultQuantity|onDelete|onEdit/);
  assert.match(jsx,/full && tab === "projects"[\s\S]*?calendarMode \? <ProjectResourceCards/);
});
test('mobile footer reserves safe space separately from scrolling content',()=>{
  const css=read('public/css/events.css').split('/* V459')[1];
  assert.match(css,/--event-sheet-footer-clearance: 56px/);
  assert.match(css,/height: min\(var\(--event-sheet-height, 100dvh\), 100dvh\) !important/);
  assert.match(css,/\.event-detail-v2--sheet > \.event-detail-sheet-footer \{[\s\S]*?flex: 0 0 auto[\s\S]*?padding:[^;]+!important/);
  assert.match(css,/grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
});
