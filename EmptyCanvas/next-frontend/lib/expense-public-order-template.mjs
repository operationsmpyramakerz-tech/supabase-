// Public, read-only order details. Match the Current/Operations/Maintenance
// order modal presentation without mounting the authenticated app or exposing
// its actions, raw IDs, private attachment URLs, or database payload.
import { orderCreatedDate, orderDeliveryDate, orderPriority } from '../components/orders/order-summary-meta.mjs';

const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = v => String(v ?? '').trim();
const display = v => text(v) ? e(v) : '—';
const date = v => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.valueOf()) ? '—' : e(d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' })); };
const money = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? `EGP ${Number(v).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
const list = v => Array.isArray(v) ? v.filter(Boolean) : [];
const itemCount = n => `${n} ${n === 1 ? 'item' : 'items'}`;
const typeKey = v => text(v).toLowerCase().replace(/[^a-z0-9]/g,'');
const orderTypes = new Map([['requestproducts',['Request Products','shopping-cart','request']],['withdrawproducts',['Withdraw Products','log-out','withdraw']],['requestmaintenance',['Request Maintenance','tool','maintenance']]]);
const typeMeta = v => orderTypes.get(typeKey(v)) || [text(v) || 'Order','package','generic'];
// Same order stage indexes and maximum-per-group rule as Operations Orders;
// the dedicated Maintenance Orders view accepts Done/Completed as well.
export function publicOrderStage(status, maintenance = false) {
  const s = text(status).toLowerCase().replace(/[_-]+/g,' ');
  if (/archive/.test(s)) return 5;
  if (/(arrived|delivered|received)/.test(s) || (maintenance && /done|complete/.test(s))) return 4;
  if (/(shipped|shipping|on the way|delivering|prepared)/.test(s)) return 3;
  if (/(in progress|inprogress|progress|approved)/.test(s)) return 2;
  return 1;
}
function itemStatus(row) {
  const stage = publicOrderStage(row.status);
  if (stage >= 5) return ['Archive','purple'];
  if (stage >= 4) return ['Delivered','green'];
  if (stage >= 3) return ['Shipping','blue'];
  const decisions = `${text(row.svApproval)} ${text(row.operationsApproval)}`;
  if (/reject/i.test(decisions) || text(row.rejectedReason) || /reject/i.test(text(row.status))) return ['Rejected','red'];
  if (/approv/i.test(decisions) || stage === 2) return ['Approved','green'];
  return ['Under Supervision','amber'];
}
const paths = {
  eye:'<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  activity:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  truck:'<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  home:'<path d="M3 11l9-8 9 8 M5 10v11h14V10 M9 21v-6h6v6"/>',
  'shopping-cart':'<circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  'log-out':'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9"/>',
  tool:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  package:'<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M3.3 7l8.7 5 8.7-5 M12 22V12"/>',
  'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.package}</svg>`;
const field = (label, value) => `<div class="metric"><span>${e(label)}</span><strong dir="auto">${value}</strong></div>`;
const priority = value => { const key = text(value).toLowerCase(); return `<span class="priority ${['low','normal','high','urgent'].includes(key)?key:'unknown'}">${display(value)}</span>`; };
function progressTrack(items, maintenance) {
  const stage = Math.min(4, Math.max(1,...items.map(x => publicOrderStage(x.status, maintenance))));
  const labels = ['Under Supervision', maintenance ? 'In progress' : 'Approved', 'Shipping', 'Delivered'];
  return `<div class="co-track-pill" role="img" aria-label="Order progress: ${labels[stage-1]}, step ${stage} of 4">${['eye','activity','truck','home'].map((name,i) => `<span class="co-track-step${i+1<=stage?' is-active':''}${i+1===stage?' is-current':''}" title="${labels[i]}">${icon(name)}</span>${i<3?`<span class="co-track-conn${i+1<stage?' is-active':''}"></span>`:''}`).join('')}</div>`;
}
function productCode(row) {
  // Only display a human-facing catalog code, not internal row/device IDs.
  return [row.idCode,row.displayId,row.customizeId,row.productId].map(text).find(v => /^[A-Za-z]{1,5}[0-9]{3,12}$/.test(v)) || '';
}
function quantity(row) { return row.quantityEditedBySupervisor ?? row.quantityProgress ?? row.quantityRequested ?? row.quantity; }
function itemAmount(row) { return Math.abs(Number(quantity(row)) || 0) * Math.abs(Number(row.unitPrice) || 0); }
function productCard(row) {
  const [label,tone] = itemStatus(row);
  const stage = publicOrderStage(row.status);
  const qty = quantity(row);
  const received = Number(row.quantityReceived) || 0, remaining = Number(row.quantityRemaining) || 0;
  const partial = stage >= 3 && stage < 5 && Math.abs(received)>1e-9 && Math.abs(remaining)>1e-9 && Math.abs(remaining)<Math.abs(Number(qty)||0)-1e-9;
  const qtyMarkup = partial ? `<s>${display(qty)}</s> <strong>${display(remaining)}</strong>` : display(qty);
  const shownTotal = partial && row.unitPrice != null ? money(Math.abs(remaining)*Math.abs(Number(row.unitPrice)||0)) : row.unitPrice==null ? '—' : money(itemAmount(row));
  return `<article class="co-item"><div class="component-main"><h3 dir="auto">${display(row.productName)}</h3><div class="prices">Unit: ${money(row.unitPrice)} <span>·</span> Total: ${shownTotal}</div>${row.issueDescription && !/^created\s+from\s+proposal\s*:/i.test(row.issueDescription)?`<div class="note" dir="auto">${e(row.issueDescription)}</div>`:''}${row.actualIssueDescription?`<div class="note"><b>Actual issue:</b> <span dir="auto">${e(row.actualIssueDescription)}</span></div>`:''}${row.repairAction?`<div class="note"><b>Repair:</b> <span dir="auto">${e(row.repairAction)}</span></div>`:''}</div><div class="component-side"><b>Qty: ${qtyMarkup}</b><span class="status ${tone}">${label}</span></div></article>`;
}
const compareName = (a,b) => text(a).localeCompare(text(b),undefined,{sensitivity:'base',numeric:true});
function productGroups(items) {
  const groups = new Map();
  for (const row of items) { const tag= text(row.productTag) || text(row.kitTag) || 'Components'; if (!groups.has(tag)) groups.set(tag,[]); groups.get(tag).push(row); }
  return [...groups].sort(([a],[b])=>compareName(a,b)).map(([tag,rows])=>`<section class="components"><div class="group-title"><div><small>Product Tag</small><strong dir="auto">${e(tag)}</strong></div><span>${itemCount(rows.length)}</span></div>${rows.slice().sort((a,b)=>compareName(a.productName,b.productName)).map(productCard).join('')}</section>`).join('');
}
function maintenanceLogs(row) {
  const logs = list(row.maintenanceLogs);
  if (logs.length) return logs;
  if (row.serialNumber || row.resolutionMethod || row.actualIssueDescription || row.repairAction || list(row.maintenanceChecklist).length || list(row.sparePartsNeededEntries).length || list(row.sparePartsReplacedEntries).length) return [{...row, loggedAt:row.maintenanceLoggedAt,technicianName:row.maintenanceTechnicianName}];
  return [];
}
function machineBlock(row, log={}) {
  const code = productCode(row);
  return `<section class="detail-group machine"><h4>Machine details</h4><div class="detail-grid"><div class="detail-field"><span>Component</span><strong dir="auto">${display(row.productName)}</strong>${code?`<small>ID: ${e(code)}</small>`:''}</div>${field('Serial number',display(log.serialNumber))}</div></section><div class="initial-issue"><span>Initial issue</span><p dir="auto">${display(row.issueDescription || row.reason)}</p></div>`;
}
function spareBlock(title, entries, empty) {
  const parts=list(entries);
  const partQty = p => Math.max(1,Math.round(Number(p.qty ?? p.quantity ?? 1)||1));
  const partTotal = p => Number(p.total ?? (Number(p.unitPrice||0)*partQty(p)))||0;
  const total = parts.reduce((sum,p)=>sum+Math.max(0,partTotal(p)),0);
  return `<section class="spare-card"><div class="spare-head"><b>${e(title)}</b><span>${parts.length}</span></div>${parts.length?parts.map((p,i)=>`<div class="spare-row"><span class="spare-index">${i+1}</span><div class="spare-name"><strong dir="auto">${display(p.name)}</strong>${productCode(p)?`<small>ID: ${e(productCode(p))}</small>`:''}</div><div class="spare-qty"><small>Qty</small><strong>${partQty(p)}</strong></div>${Number(p.unitPrice)>0?`<div class="spare-qty"><small>Unit</small><strong>${money(p.unitPrice)}</strong></div>`:''}${partTotal(p)>0?`<div class="spare-qty"><small>Total</small><strong>${money(partTotal(p))}</strong></div>`:''}</div>`).join(''):`<p class="empty">${e(empty)}</p>`}${total>0?`<div class="spare-total"><span>Total cost</span><strong>${money(total)}</strong></div>`:''}</section>`;
}
function maintenanceLogCard(row, log, i) {
  const checks=list(log.maintenanceChecklist).map(x=>text(x?.text ?? x?.value ?? x)).filter(Boolean);
  return `<fieldset class="log-frame log-${i===0?'one':i===1?'two':'more'}"><legend>${i===0?'Log One':i===1?'Log Two':`Log ${i+1}`}</legend><div class="detail-grid log-meta">${field('Technician name',display(log.technicianName))}${field('Date',date(log.loggedAt))}</div>${machineBlock(row,log)}<section class="detail-group action"><h4>Maintenance action</h4><div class="detail-grid">${field('Resolution method',display(log.resolutionMethod))}<div class="detail-field"><span>Maintenance checklist</span>${checks.length?checks.map(v=>`<div class="check-item">${icon('check-circle')}<strong dir="auto">${e(v)}</strong></div>`).join(''):'<small>No checklist items recorded</small>'}</div>${field('Actual issue description',display(log.actualIssueDescription))}${field('Repair action',display(log.repairAction))}</div></section><section class="detail-group spares"><h4>Spare parts</h4><div class="detail-grid">${spareBlock('Spare parts needed',log.sparePartsNeededEntries,'No spare parts needed')}${spareBlock('Spare parts replaced',log.sparePartsReplacedEntries,'No spare parts replaced')}</div></section></fieldset>`;
}
function maintenanceCard(row,i) {
  const code=productCode(row), logs=maintenanceLogs(row);
  return `<article class="maintenance-item"><div class="machine-head"><span class="machine-icon">${icon('tool')}</span><div><small>Component ${i+1}</small><h3 dir="auto">${display(row.productName)}</h3>${code?`<small>ID: ${e(code)}</small>`:''}</div></div>${logs.length?logs.map((log,j)=>maintenanceLogCard(row,log,j)).join(''):machineBlock(row)}</article>`;
}
function renderGroup(items) {
  const first=items[0], [label,iconName,tone]=typeMeta(first.orderType), maintenance=tone==='maintenance';
  const group={items};
  const reasonCounts=new Map(); for(const item of items){const r=text(item.reason);if(r)reasonCounts.set(r,(reasonCounts.get(r)||0)+1);}
  const reason=[...reasonCounts].sort((a,b)=>b[1]-a[1])[0]?.[0] || 'No reason';
  const hasPrices=items.some(x=>x.unitPrice!=null), total=items.reduce((sum,row)=>sum+itemAmount(row),0);
  const summary=`${maintenance?field('Team member',display(items.find(x=>text(x.createdByName))?.createdByName)):''}${field('Created Date',date(orderCreatedDate(group)))}${field('Delivery Date',date(orderDeliveryDate(group)))}${maintenance?'':field('Components',String(items.length))}${field('Priority',priority(orderPriority(group)))}`;
  return `<section class="order ${tone}"><div class="order-icon">${icon(iconName)}</div><header><h1 dir="auto">${e(label)}</h1><div class="order-number" dir="auto">${display(first.orderId)}</div></header><div class="metrics">${summary}</div>${progressTrack(items,maintenance)}${maintenance?'':`<div class="reason" dir="auto">${e(reason)}</div>${hasPrices?`<div class="estimate"><span>Estimate Total</span><strong>${money(total)}</strong></div>`:''}`}<div class="list-head"><h2>Components</h2><span>${itemCount(items.length)}</span></div>${maintenance?items.slice().sort((a,b)=>compareName(a.productName,b.productName)).map(maintenanceCard).join(''):productGroups(items)}</section>`;
}
export function renderPublicExpenseOrders(groups) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Order Details | Pyramakerz</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#111827;font:14px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}main{max-width:920px;margin:auto;padding:24px 16px 40px}.brand{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 48px;font-weight:750}.brand b{border-left:4px solid #f97316;padding-left:9px}.brand span{font-size:12px;color:#64748b;flex-shrink:0}.order{position:relative;margin:0 0 48px;background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:28px 18px 18px;box-shadow:0 12px 32px #1118270c;min-width:0}.order-icon{position:absolute;top:-30px;left:50%;transform:translateX(-50%);width:60px;height:60px;background:linear-gradient(155deg,#64748b,#334155);color:#fff;border-radius:19px;display:grid;place-items:center;box-shadow:0 8px 18px #11182725}.order-icon svg{width:29px;height:29px}.request .order-icon{background:linear-gradient(155deg,#22c55e,#15803d)}.withdraw .order-icon{background:linear-gradient(155deg,#ef4444,#b91c1c)}.maintenance .order-icon{background:linear-gradient(155deg,#f2b705,#a16207)}header{text-align:center;margin:8px 0 16px}h1{font-size:34px;line-height:1.12;letter-spacing:-.035em;font-weight:900;color:#09090b;margin:0;overflow-wrap:anywhere}.order-number{color:#64748b;font-size:12px;font-weight:750;margin-top:5px}.metrics,.detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.metric,.detail-field{min-width:0;min-height:60px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:5px;padding:10px 11px;background:#f6f7f9;border:1px solid #e5e7eb;border-radius:13px}.metric>span:first-child,.detail-field>span:first-child,.machine-head small:first-child,.group-title small,.initial-issue>span{display:block;text-transform:uppercase;letter-spacing:.04em;color:#64748b;font-size:10px;font-weight:800}.metric strong,.detail-field strong{font-size:13px;overflow-wrap:anywhere;white-space:pre-wrap}.priority,.status{display:inline-block;border:1px solid #e2e8f0;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:750;line-height:1.25;background:#f1f5f9;color:#475569}.priority.urgent,.status.red{background:#fee2e2;color:#b91c1c;border-color:#fecaca}.priority.high,.status.amber{background:#fff1d6;color:#92400e;border-color:#fed7aa}.priority.normal,.status.green{background:#dcfce7;color:#166534;border-color:#a7f3d0}.priority.low,.status.blue{background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe}.status.purple{background:#f3e8ff;color:#6b21a8;border-color:#e9d5ff}.co-track-pill{background:#000;border-radius:999px;margin-top:12px;padding:10px 12px;display:flex;align-items:center;gap:8px}.co-track-step{width:44px;height:44px;flex:0 0 44px;border-radius:50%;background:#383838;color:#b3b3b3;display:grid;place-items:center}.co-track-step svg{width:20px;height:20px}.co-track-step.is-active{background:#D9F99D;color:#000}.co-track-step.is-current{box-shadow:0 0 0 4px #d9f99d38}.co-track-conn{height:9px;min-width:0;flex:1;border-radius:99px;background:#383838}.co-track-conn.is-active{background:#D9F99D}.reason{position:relative;isolation:isolate;overflow:hidden;margin-top:20px;padding:15px 18px;min-height:52px;border-radius:15px;text-align:center;display:grid;place-items:center;color:white;font-weight:750;white-space:pre-wrap;overflow-wrap:anywhere;background:radial-gradient(circle at 11% 22%,transparent 0 8px,#a3e63525 9px 11px,transparent 12px),radial-gradient(circle at 89% 70%,transparent 0 9px,#94a3b833 10px 12px,transparent 13px),linear-gradient(160deg,#111827,#030712);box-shadow:0 10px 19px #11182718}.estimate{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding:9px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#f5f6f8;max-width:48%;font-size:12px;color:#64748b}.estimate strong{color:#111827;white-space:nowrap}.list-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:18px 0 9px}.list-head h2{font-size:15px;margin:0}.list-head span{color:#64748b;font-size:12px}.components{margin-bottom:12px}.group-title{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#fff7ed;border:1px solid #f2d6b4;padding:9px 11px;border-radius:12px;color:#92400e;overflow-wrap:anywhere}.group-title small{font-size:9px;color:#9a5c32;margin-bottom:3px}.group-title strong{font-size:12px}.group-title>span{flex-shrink:0;border:1px solid #f2d6b4;background:#fffdfa;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:750}.co-item{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:11px;margin-top:7px;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 5px 12px #11182709;background:white}.component-main{flex:1;min-width:0}.co-item h3,.machine-head h3{font-size:13px;font-weight:800;margin:0 0 5px;overflow-wrap:anywhere;text-align:start}.prices,.note{font-size:11px;color:#64748b;overflow-wrap:anywhere;white-space:pre-wrap}.prices span{padding:0 2px}.note{margin-top:5px}.component-side{flex:0 0 auto;max-width:42%;display:flex;flex-direction:column;align-items:flex-end;gap:7px;text-align:right;font-size:12px}.component-side s{color:#94a3b8;font-weight:500}.status{max-width:100%;overflow-wrap:anywhere;text-align:center}.maintenance-item{padding:14px;border:1px solid #e5e7eb;background:white;border-radius:20px;margin-top:10px;min-width:0}.machine-head{display:flex;align-items:center;gap:11px;margin-bottom:12px}.machine-head>div{min-width:0}.machine-head h3{font-size:15px;margin:3px 0}.machine-head small{color:#64748b;font-size:11px}.machine-icon{width:44px;height:44px;flex:0 0 44px;display:grid;place-items:center;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:13px}.machine-icon svg{width:20px;height:20px}.detail-group{border:1px solid #e7ebf1;background:#fff;border-radius:15px;padding:11px;margin-top:10px;min-width:0}.detail-group.machine,.detail-group.action{border-color:#f2c98b;background:linear-gradient(#fffdf9,#fff)}.detail-group.spares{background:#fbfcfe}.detail-group h4{font-size:12px;margin:0 0 9px}.detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-grid .metric,.detail-field{justify-content:flex-start;min-height:68px}.detail-grid .metric strong,.detail-field strong{color:#334155;font-size:12px;line-height:1.5}.detail-field small{color:#64748b;font-size:10px}.initial-issue{margin-top:10px;padding:12px;border:1px solid #f2dfb1;border-radius:15px;background:#fffbeb}.initial-issue>span{color:#92400e}.initial-issue p{margin:6px 0 0;font-size:12px;color:#334155;font-weight:650;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.log-frame{margin:14px 0 0;padding:12px;border:1px solid #f2c98b;border-radius:16px;min-width:0;background:#fffdf9}.log-frame legend{padding:5px 12px;font-size:12px;font-weight:800;border:1px solid #fed7aa;border-radius:999px;background:#fff7ed;color:#a64b08}.log-two{background:#fcfaff;border-color:#d9cff8}.log-two legend{border-color:#d9cff8;background:#f4f0ff;color:#6d42b8}.log-more{background:#f4fbf9;border-color:#bfe2db}.log-more legend{background:#effaf7;border-color:#bfe2db;color:#236f63}.check-item{display:flex;align-items:flex-start;gap:5px}.check-item svg{width:14px;height:14px;flex:0 0 14px;color:#15803d;margin-top:2px}.spare-card{padding:9px;border:1px solid #e2e8f0;border-radius:12px;background:white;min-width:0}.spare-head{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:11px}.spare-head span,.spare-index{background:#f1f5f9;color:#475569;border-radius:7px;padding:4px 7px}.spare-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:7px 0;border-bottom:1px solid #e5e7eb}.spare-row:last-child{border-bottom:0}.spare-name{min-width:70px;flex:1;overflow-wrap:anywhere;font-size:11px}.spare-name small,.spare-qty small{display:block;color:#64748b;font-size:9px}.spare-qty{font-size:11px;text-align:center;flex-shrink:0}.spare-total{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;padding-top:8px;font-size:11px;color:#334155}.empty{color:#64748b;font-size:11px;margin:10px 0 0}.foot{text-align:center;color:#64748b;font-size:12px}svg{flex-shrink:0}
@media(max-width:600px){main{padding:20px 10px 24px}.brand{font-size:13px;gap:8px}.brand span{font-size:10px}.order{padding:28px 12px 15px;border-radius:24px}.order-icon{width:56px;height:56px;top:-28px;border-radius:18px}h1{font-size:27px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{min-height:56px;padding:9px}.co-track-step{width:36px;height:36px;flex-basis:36px}.co-track-step svg{width:17px;height:17px}.co-track-pill{padding:10px;gap:6px}.co-track-conn{height:7px}.estimate{max-width:none}.co-item{gap:8px;padding:10px}.maintenance-item,.log-frame{padding:10px}.detail-group{padding:9px}.spares .detail-grid{grid-template-columns:1fr}.detail-grid .metric,.detail-field{padding:8px}.component-side{max-width:42%}.initial-issue{padding:10px}}
@media(max-width:360px){.detail-grid{grid-template-columns:1fr}.brand{flex-wrap:wrap}.co-track-step{width:32px;height:32px;flex-basis:32px}.co-item h3{font-size:12px}.status{font-size:10px;padding:4px 6px}}
@media print{body{background:white}.order{box-shadow:none;break-inside:auto;margin-bottom:35px}.co-item,.maintenance-item,.detail-group{break-inside:avoid}.co-track-pill,.order-icon,.reason,.priority,.status{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main><div class="brand"><b>Pyramakerz Technologies</b><span>Shared · Read only</span></div>${list(groups).filter(rows=>Array.isArray(rows)&&rows.length).map(renderGroup).join('')}<p class="foot">Shared order details · Components linked to the exported expense.</p></main></body></html>`;
}
