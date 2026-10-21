import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eventRequestScopeFor, eventRequestOwnerAllowed, eventRequestCardAllowed, EVENT_REQUEST_SCOPE_MARKER } from '../lib/event-request-scope.mjs';
import { featureAllowed } from '../lib/feature-permissions-registry.js';
const read = path => readFileSync(resolve(import.meta.dirname,'..',path),'utf8');
const account = (view='team',edit='own',marker=true) => ({ teamMemberId:'manager',featureAccess:{mode:'enforced',grants:{
  'events.requests.view':{allowed:true,scope:view}, 'events.requests.edit':{allowed:true,scope:edit},
  'events.requests.cancel':{allowed:false,scope:'all'}, 'events.requests.pdf':{allowed:true,scope:'team'},
  'events.requests.workflow':{allowed:true,scope:'all'},
  ...(marker ? {[EVENT_REQUEST_SCOPE_MARKER]:{allowed:true,scope:'all'}} : {})
}}});
test('Event Requests scope requires explicit user opt-in and never widens View',()=>{
  assert.equal(eventRequestScopeFor(account('team','own',false),'events.requests.view'),null);
  assert.equal(eventRequestScopeFor(account(),'events.requests.edit'),'own');
  assert.equal(eventRequestScopeFor(account('own','all'),'events.requests.edit'),'own');
  assert.equal(eventRequestScopeFor(account(),'events.requests.cancel'),'none');
  assert.equal(eventRequestScopeFor(account(),'events.requests.workflow'),'team');
  assert.equal(eventRequestScopeFor(account(),'events.requests.create'),null);
});
test('Feature grants with row scopes are accepted only when the scope marker is enabled',()=>{
  assert.equal(featureAllowed(account(),'events.requests.edit'),true);
  assert.equal(featureAllowed(account('team','own',false),'events.requests.edit'),false);
  assert.equal(featureAllowed(account(),'events.requests.cancel'),false);
  const limited=account(); limited.featureAccess.grants['events.requests.view'].allowed=false;
  assert.equal(eventRequestScopeFor(limited,'events.requests.edit'),'none');
});
test('Event ownership uses original creator ID not requester display names',()=>{
  const ids=['manager','colleague'];
  assert.equal(eventRequestOwnerAllowed({createdByUserId:'colleague'},'team',ids),true);
  assert.equal(eventRequestOwnerAllowed({createdByUserId:'outsider',requesterName:'Manager'},'team',ids),false);
  assert.equal(eventRequestOwnerAllowed({requesterName:'Manager'},'own',ids),false);
  assert.equal(eventRequestOwnerAllowed({created_by_user_id:'manager'},'own',ids),true);
  const policy={self:'manager',visibleIds:ids,scopes:{view:'team',edit:'own',pdf:'team',cancel:'none'}};
  assert.equal(eventRequestCardAllowed(policy,'edit',{createdByUserId:'colleague'}),false);
  assert.equal(eventRequestCardAllowed(policy,'pdf',{createdByUserId:'colleague'}),true);
  assert.equal(eventRequestCardAllowed(policy,'cancel',{createdByUserId:'manager'}),false);
});
test('Event Requests list and server-rendered bootstraps filter records before sending to clients',()=>{
  assert.match(read('app/api/events/route.js'), /scopedEventRequestList\(gate\.account, events\)/);
  assert.match(read('lib/events-data.js'), /scopedEventRequestList\(gate\.account, events\)/);
  assert.match(read('lib/events-data.js'), /assertEventRequestScope\(gate\.account, "events\.requests\.edit", event\)/);
  assert.match(read('lib/event-request-scope.js'), /erp_member_scope_team_links/);
});
test('Direct details, PDF, admin token, and all mutating Event Request paths check row scope',()=>{
  for (const f of ['app/api/events/[id]/route.js','app/api/events/pdf-direct/route.js',
    'app/api/events/admin/verify/route.js','app/api/events/mutations-direct/route.js']) {
    assert.match(read(f),/assertEventRequestScope\(gate\.account/);
  }
  for (const key of ['edit','workflow','cancel','archive'])
    assert.match(read('app/api/events/mutations-direct/route.js'),new RegExp('assertEventRequestScope\\(gate\\.account, "events\\.requests\\.'+key+'"'));
});
test('Calendar access stays separate and sends only safe projection',()=>{
  assert.match(read('app/api/events/route.js'), /calendar \? eventCalendarList\(events\)/);
  assert.match(read('app/api/events/[id]/route.js'), /if \(!calendar\) await assertEventRequestScope/);
});
test('Permissions UI keeps scoped event grants and shows per-event action access',()=>{
  const ui=read('components/users-center/UsersCenterDialogs.jsx');
  assert.match(ui,/"events\.requests": EVENT_REQUEST_SCOPE_MARKER/);
  assert.match(ui,/module\.key === "events\.requests"/);
  const client=read('components/events/EventsClient.jsx');
  for (const key of ['edit','cancel','workflow','pdf'])
    assert.match(client,new RegExp('eventRequestCardAllowed\\(eventScopePolicy,"'+key+'",activeEvent\\)'));
});
