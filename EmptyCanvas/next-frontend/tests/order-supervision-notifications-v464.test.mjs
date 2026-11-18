import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const worker = read('lib/notification-event-worker.js');
const route = read('app/api/orders/shopping-cart/submit-direct/route.js');
const sql = read('sql/2026-11-18-order-supervision-notifications-v464.sql');
const accountSource = read('lib/direct-session-account.js');
const strip = source => source.replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const sample = (overrides = {}) => ({id:'ordersv:1',recipient_id:'123',owner_id:'55',category:'orders',title:'New order awaiting approval',body:'Lab 1 submitted ORD-153 (Request Products). Your approval is required.',url:'/next/orders-review?q=ORD-153',created_at:'2026-11-18T10:00:00Z',lease_token:'lease1',attempts:1, ...overrides});
const array = value => JSON.parse(JSON.stringify(value));
function harness({supervision = [sample()], legacy = [], current = true, allowed = true, channels = {in_app:true,push:true,email:true}, quiet = false, failPush = false, missing = false, failEligibility = false} = {}) {
  const calls = {saved:[],push:[],email:[],patch:[],claims:[],checks:[],legacyAudit:[]};
  const ctx = {console:{warn(){},info(){},error(){}},Date,process:{env:{}}, select:async()=>[{email:'test@example.test',name:'Reviewer'}],
    supabaseRequest:async(path, opts)=>{
      if(path.includes('erp_claim_order_supervision')) {calls.claims.push(['supervision',opts.body.p_limit]);if(missing)throw Object.assign(new Error('missing'),{status:404});return supervision;}
      if(path.includes('claim_erp_notification_events')) {calls.claims.push(['legacy',opts.body.p_limit]);return legacy;}
      if(path.includes('erp_order_supervision_notice_current')) {calls.checks.push(opts.body);return current;}
      if(opts.method==='PATCH'){calls.patch.push({path,body:array(opts.body)});return null;}
      throw new Error('unexpected call '+path);
    },canReceiveOrderReviewNotice:async id=>{if(failEligibility)throw new Error('database unavailable');return allowed;},
    getNotificationPreferences:async()=>({settings:{}}),allowsChannel:(_s,_t,c)=>channels[c]===true,isQuietHour:()=>quiet,
    saveNotificationForMember:async(id,n)=>{calls.saved.push([id,array(n)]);return true;},
    sendPushToMember:async(id,n)=>{calls.push.push([id,array(n)]);return failPush?{ok:false,error:'provider down'}:{ok:true,sent:1};},
    sendNotificationEmail:async n=>{calls.email.push(array(n));return {ok:true,provider:'smtp'};},
    digestAvailable:async()=>false,eligibleForDigest:()=>false,enqueueDigestEvent:async()=>{},
    logNotificationDelivery:async e=>{calls.legacyAudit.push(e);},deliveryReason:s=>s};
  vm.runInNewContext(strip(worker),ctx);
  return {ctx,calls};
}

test('new supervision queue routes one notification to the assigned recipient with exact order link on each enabled channel',async()=>{
  const {ctx,calls}=harness();const result=await ctx.dispatchQueuedNotifications({supervisionOnly:true});
  assert.equal(result.delivered,1);assert.equal(calls.saved.length,1);assert.equal(calls.push.length,1);assert.equal(calls.email.length,1);
  assert.equal(calls.saved[0][0],'123');assert.equal(calls.saved[0][1].url,'/next/orders-review?q=ORD-153');assert.match(calls.saved[0][1].body,/Lab 1 submitted ORD-153/);
  assert.equal(calls.push[0][1].url,calls.saved[0][1].url);assert.equal(calls.email[0].url,calls.saved[0][1].url);
  assert.deepEqual(array(calls.claims),[['supervision',6]]);assert.ok(calls.patch.every(p=>p.path.startsWith('/erp_order_supervision_notification_events?')));assert.ok(calls.patch.every(p=>p.path.includes('lease_token=eq.lease1')));
  assert.equal(calls.patch.at(-1).body.status,'delivered');assert.equal(calls.legacyAudit.length,0);
});
test('two assigned supervisors receive independent notices; no generic broadcast',async()=>{
  const {ctx,calls}=harness({supervision:[sample(),sample({id:'ordersv:2',recipient_id:'456'})]});await ctx.dispatchQueuedNotifications({supervisionOnly:true});
  assert.deepEqual(calls.saved.map(v=>v[0]).sort(),['123','456']);assert.equal(new Set(calls.saved.map(v=>v[1].id)).size,2);
});
for(const [name,opts] of [['revoked assignment, deleted order or no longer pending',{current:false}],['no Orders Review access',{allowed:false}]])test(name+' skips every channel',async()=>{
  const {ctx,calls}=harness(opts);await ctx.dispatchQueuedNotifications({supervisionOnly:true});assert.equal(calls.saved.length+calls.push.length+calls.email.length,0);assert.equal(calls.patch.at(-1).body.delivery_outcomes.in_app.outcome,'skipped');
});
test('permission service unavailable retries instead of assuming access',async()=>{
  const {ctx,calls}=harness({failEligibility:true});const result=await ctx.dispatchQueuedNotifications({supervisionOnly:true});assert.equal(result.deferred,1);assert.equal(calls.saved.length,0);assert.equal(calls.patch.at(-1).body.status,'pending');
});
test('disabled channels and quiet hours are honored',async()=>{
  for(const opts of [{channels:{}},{quiet:true,channels:{in_app:true,push:true,email:false}}]){
    const {ctx,calls}=harness(opts);await ctx.dispatchQueuedNotifications({supervisionOnly:true});assert.equal(calls.push.length+calls.email.length,0);assert.equal(calls.saved.length,opts.quiet?1:0);
  }
});
test('transient push failure retries; already completed channels are not sent again',async()=>{
  const {ctx,calls}=harness({failPush:true});const result=await ctx.dispatchQueuedNotifications({supervisionOnly:true});assert.equal(result.deferred,1);assert.equal(calls.patch.at(-1).body.status,'pending');assert.ok(calls.patch.some(p=>p.body.in_app_done===true));assert.ok(calls.patch.some(p=>p.body.email_done===true));assert.ok(!calls.patch.some(p=>p.body.push_done===true));
  const retry=harness({supervision:[sample({attempts:2,in_app_done:true,email_done:true})]});await retry.ctx.dispatchQueuedNotifications({supervisionOnly:true});assert.equal(retry.calls.saved.length+retry.calls.email.length,0);assert.equal(retry.calls.push.length,1);
});
test('legacy notifications still dispatch if V464 SQL is not installed',async()=>{
  const {ctx,calls}=harness({missing:true,legacy:[sample({id:'old1'})]});const result=await ctx.dispatchQueuedNotifications({limit:4});assert.equal(result.delivered,1);assert.deepEqual(array(calls.claims),[['supervision',2],['legacy',4]]);assert.equal(calls.checks.length,0);assert.ok(calls.patch.every(p=>p.path.startsWith('/erp_notification_events?')));assert.ok(calls.legacyAudit.length>0);
});
test('combined workers retain the original total claim budget',async()=>{
  const {ctx,calls}=harness({supervision:[sample(),sample({id:'ordersv:2'})],legacy:[sample({id:'old1'})]});await ctx.dispatchQueuedNotifications({limit:4});assert.deepEqual(array(calls.claims),[['supervision',2],['legacy',2]]);
});
function runSubmit({editMode=false,success=true,throwSave=false,failRelease=false}={}){
  const scheduled=[], releases=[], queues=[];
  const ctx={console:{warn(){}},NextResponse:{json:(payload,init)=>({payload,init})},after:f=>scheduled.push(f),
    rpc:async(name,args)=>{releases.push([name,array(args)]);if(failRelease)throw new Error('temporary error');},
    dispatchQueuedNotifications:async args=>queues.push(array(args)),getLegacyAccountGate:async()=>({ok:true,account:{teamMemberId:'55'}}),orderActionGate:g=>g,
    assertShoppingCartSources:async()=>{},getKit:async()=>{},shoppingSourceAllowed:()=>true,
    submitShoppingCartOrderDirect:async()=>{if(throwSave)throw new Error('save failed');return {success,orderNumber:153,orderItems:[{orderPageId:'100'},{orderPageId:'101'}]};}};
  vm.runInNewContext(strip(route),ctx);
  return {scheduled,releases,queues,run:()=>ctx.POST({json:async()=>({editMode,ownerId:'forged',orderNumber:999})})};
}
test('new successful submit releases only server-returned saved IDs and dispatches after response',async()=>{
  const h=runSubmit();const result=await h.run();assert.equal(result.payload.success,true);assert.equal(h.scheduled.length,1);assert.equal(h.releases.length,0);await h.scheduled[0]();assert.deepEqual(h.releases,[['erp_release_order_supervision_notifications_v464',{p_order_number:'153',p_owner_id:'55',p_row_ids:['100','101']}]]);assert.deepEqual(h.queues,[{limit:10,supervisionOnly:true}]);
});
test('edit and failed submissions never release a supervisor alert',async()=>{
  for(const opts of [{editMode:true},{success:false},{throwSave:true}]){const h=runSubmit(opts);await h.run();assert.equal(h.scheduled.length,0);}
});
test('release failure is isolated from completed order and worker can still process queued events',async()=>{
  const h=runSubmit({failRelease:true});assert.equal((await h.run()).payload.success,true);await h.scheduled[0]();assert.equal(h.queues.length,1);
});
test('SQL uses statement-level batch dedupe, exact supervision mapping and skips existing order rows (static check)',()=>{
  assert.match(sql,/AFTER INSERT ON public\.orders\s+REFERENCING NEW TABLE AS inserted_order_rows\s+FOR EACH STATEMENT/);
  assert.match(sql,/previous\.order_number = n\.order_number[\s\S]*ins\.id = previous\.id/);assert.match(sql,/array_agg\(row_id ORDER BY row_id\)/);assert.match(sql,/s\.visible_team_member_id::text = b\.owner_id/);assert.match(sql,/ON CONFLICT \(id\) DO NOTHING/);assert.match(sql,/sv_approval[\s\S]*IN \('','notstarted','pending'\)/);
  assert.match(sql,/e\.source_row_ids <@ p_row_ids/);assert.match(sql,/o\.id::text = ANY\(e\.source_row_ids\)/);assert.match(sql,/FOR UPDATE SKIP LOCKED/);assert.match(sql,/FROM PUBLIC, anon, authenticated/);assert.match(sql,/HAVING count\(\*\) = 1/);
});
test('server enforces Orders Review page and feature grants before sending; creator ID comes from authenticated account',()=>{
  assert.match(accountSource,/function canReceiveOrderReviewNotice[\s\S]*gateFromAccount\(account, \{\}, \["Orders Review"\]\)\.ok[\s\S]*featureAllowed\(account, "orders.review.view"\)/);
  assert.match(read('lib/shopping-cart-order-service.js'),/team_member_id: accountMemberId\(account\) \|\| null,\s*team_member_name: creatorName/);
  assert.match(read('components/orders/OrdersReviewClient.jsx'),/params\.get\("q"\)/);assert.match(read('lib/order-search-hotpath.js'),/params\.order_number = `eq\.\$\{plan\.orderNumber\}`/);
});

test('exact-order notifications remount Orders Review query state when navigating within the same page',()=>{
  const page = read('app/orders-review/page.jsx');
  assert.match(page,/params\.q/);assert.match(page,/key=\{reviewLinkKey\}/);
});
