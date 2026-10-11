import 'server-only';

import crypto from 'node:crypto';
import { select, supabaseRequest } from './supabase-rest';
import { notificationUsers, canSeeAnyPage, saveNotificationForMember } from './notifications-data';
import { getNotificationPreferences, allowsChannel, isQuietHour } from './notification-preferences';
import { sendPushToMember } from './push-notifications';
import { sendNotificationEmail } from './notification-email';
import { planSlaAlerts } from './home-sla-alert-planner.mjs';

const TABLE = 'erp_sla_alert_outbox';
const PAGE = {
  current: ['Current Orders'], review: ['Orders Review'],
  operations: ['Operations Orders', 'Requested Orders'], maintenance: ['Maintenance Orders'],
};
const EVENTS_LIMIT = 15000;
const idOf = (value) => String(value ?? '').trim();
const missing = (error) => /pgrst20[25]|42p01|does not exist|could not find|schema cache/i.test(String(error?.message || '')) || error?.status === 404;

async function readOwnOrders(memberId) {
  // Fail closed if there are more rows than the scan can fully verify.
  const owned = await select(process.env.SUPABASE_ORDERS_TABLE || 'orders', {
    select: 'id,order_number,order_type,team_member_id,sv_approval,status', team_member_id: `eq.${memberId}`, limit: '1001', order: 'id.asc',
  }, { profileName: 'sla.scan.owned-orders' });
  if (owned.length > 1000) return [];
  const ids = [...new Set(owned.map(row => idOf(row.order_number)).filter(num => /^[1-9]\d*$/.test(num)))];
  if (ids.length > 250) return [];
  const result = [];
  for (let i = 0; i < ids.length; i += 40) {
    const subset = ids.slice(i, i + 40);
    const rows = await select(process.env.SUPABASE_ORDERS_TABLE || 'orders', {
      select: 'id,order_number,order_type,team_member_id,sv_approval,status', order_number: `in.(${subset.join(',')})`, limit: '1001',
    }, { profileName: 'sla.scan.all-order-rows' });
    if (rows.length > 1000) return [];
    result.push(...rows);
  }
  const grouped = new Map();
  for (const row of result) {
    const key = idOf(row.order_number);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return [...grouped].filter(([key, rows]) => ids.includes(key) &&
    rows.every(row => idOf(row.team_member_id) === memberId)).map(([key, rows]) => {
    const categories = new Set(rows.map(row => String(row.order_type || '').toLowerCase().includes('maintenance') ? 'maintenance' : 'other'));
    if (categories.size !== 1) return null;
    const type = String(rows[0].order_type || '').toLowerCase();
    return { orderNumber: key, expectedRows: rows.length,
      isMaintenance: type.includes('maintenance'),
      approved: rows.every(row => /^approved?(\b|$)/i.test(String(row.sv_approval || '').trim())),
      rejected: rows.some(row => /reject|cancel/i.test(String(row.status || ''))),
    };
  }).filter(Boolean);
}

async function auditFor(scopes) {
  const events = [];
  for (let i = 0; i < scopes.length; i += 35) {
    const values = scopes.slice(i, i + 35).map(o => o.orderNumber);
    let offset = 0;
    do {
      const page = await select('erp_order_lifecycle_events', {
        select: 'id,order_number,row_id,event_type,occurred_at,status,sv_approval,operations_approval',
        order_number: `in.(${values.join(',')})`, order: 'id.asc', limit: '1000', offset: String(offset),
      }, { profileName: 'sla.scan.audited-events' });
      events.push(...page);
      if (events.length >= EVENTS_LIMIT) return null;
      offset += page.length;
      if (page.length < 1000) break;
    } while (true);
  }
  return events;
}

async function enqueueAlerts(now) {
  const policies = await select('erp_home_sla_policies', {
    select: 'workspace,enabled,target_hours,warning_percent,time_basis,updated_at', limit: '4',
  }, { profileName: 'sla.scan.policies' });
  if (!policies.some(row => row.enabled === true)) return { inspected: 0, queued: 0 };
  const [calendarRows, preferencesRows, users] = await Promise.all([
    select('erp_home_sla_calendar', { select: 'enabled,timezone,work_days,work_start,work_end,holidays', id: 'eq.company', limit: '1' }),
    select(process.env.SUPABASE_NOTIFICATION_PREFERENCES_TABLE || 'notification_preferences', {
      select: 'user_id,settings', limit: '1001', order: 'user_id.asc',
    }),
    notificationUsers(),
  ]);
  if (preferencesRows.length > 1000) return { inspected: 0, queued: 0, deferred: 'preference cap reached' };
  const userMap = new Map(users.map(u => [u.id, u]));
  let queued = 0, inspected = 0;
  for (const pref of preferencesRows) {
    const memberId = idOf(pref.user_id);
    const raw = pref.settings || {};
    if (!memberId || !raw.channels?.sla || !Object.values(raw.channels.sla).some(v => v === true)) continue;
    const user = userMap.get(memberId);
    if (!user || !Object.values(PAGE).some(aliases => canSeeAnyPage(user, aliases))) continue;
    const preferences = (await getNotificationPreferences(memberId)).settings;
    if (!Object.values(preferences.channels.sla).some(Boolean)) continue;
    inspected++;
    const orders = await readOwnOrders(memberId);
    if (!orders.length) continue;
    const events = await auditFor(orders);
    if (!events) continue;
    const alerts = planSlaAlerts(orders, events, policies, calendarRows[0] || null, now, preferences.sla_alerts);
    for (const alert of alerts) {
      if (!canSeeAnyPage(user, PAGE[alert.workspace])) continue;
      const id = crypto.createHash('sha256').update(`${memberId}:${alert.key}`).digest('hex');
      const result = await supabaseRequest(`/${TABLE}?on_conflict=id`, {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: { id, recipient_id: memberId, workspace: alert.workspace, order_number: Number(alert.orderNumber), kind: alert.kind,
          title: alert.title, body: alert.body, url: alert.url, created_at: new Date(now).toISOString() },
        profileName: 'sla.scan.enqueue',
      });
      // The insert is deduplicated in PostgreSQL even if two Cron invocations overlap.
      void result;
      queued++;
    }
  }
  return { inspected, candidates: queued };
}

async function patch(item, data) {
  await supabaseRequest(`/${TABLE}?id=eq.${item.id}&lease_token=eq.${encodeURIComponent(item.lease_token)}&status=eq.processing`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: data, profileName: 'sla.alert.progress',
  });
  Object.assign(item, data);
}

async function stillEligible(item, settings) {
  // A retry may run after delivery, approval, target changes, or an access revoke.
  const user = (await notificationUsers()).find(u => u.id === idOf(item.recipient_id));
  if (!user || !canSeeAnyPage(user, PAGE[item.workspace] || [])) return false;
  const scopes = (await readOwnOrders(idOf(item.recipient_id)))
    .filter(group => group.orderNumber === idOf(item.order_number));
  if (scopes.length !== 1) return false;
  const [events, policies, calendars] = await Promise.all([
    auditFor(scopes),
    select('erp_home_sla_policies', { select: 'workspace,enabled,target_hours,warning_percent,time_basis,updated_at',
      workspace: `eq.${item.workspace}`, limit: '1' }),
    select('erp_home_sla_calendar', { select: 'enabled,timezone,work_days,work_start,work_end,holidays', id: 'eq.company', limit: '1' }),
  ]);
  if (!events || policies.length !== 1) return false;
  if (item.kind === 'follow_up' && Date.now() - Date.parse(item.created_at) > 24 * 3600000) return false;
  const ready = planSlaAlerts(scopes, events, policies, calendars[0] || null, Date.now(), settings.sla_alerts);
  return ready.some(alert => alert.workspace === item.workspace && alert.orderNumber === idOf(item.order_number) &&
    alert.kind === item.kind && crypto.createHash('sha256').update(`${idOf(item.recipient_id)}:${alert.key}`).digest('hex') === item.id);
}

async function deliver(item) {
  const memberId = idOf(item.recipient_id);
  const { settings } = await getNotificationPreferences(memberId);
  if (!Object.values(settings.channels.sla || {}).some(Boolean) ||
      settings.sla_alerts?.[item.kind] !== true || !(await stillEligible(item, settings))) {
    // Stale, completed, unapproved or disabled notifications are discarded.
    await patch(item, { in_app_done: true, push_done: true, email_done: true,
      status: 'delivered', lease_token: null, lease_until: null, delivered_at: new Date().toISOString() });
    return;
  }
  // Re-check every channel immediately before delivery: user changes apply even
  // to already queued alerts. Late cron runs cannot override a user's decision.
  const allowed = (channel) => allowsChannel(settings, 'sla', channel);
  const alertEnabled = settings.sla_alerts?.[item.kind] === true;
  const notif = { id: `sla:${item.id}`, type: 'sla', title: item.title, body: item.body, url: item.url,
    ts: Date.parse(item.created_at) || Date.now(), read: false };
  if (!item.in_app_done) {
    if (alertEnabled && allowed('in_app')) await saveNotificationForMember(memberId, notif, { settings });
    await patch(item, { in_app_done: true });
  }
  let pushError = null;
  if (!item.push_done) {
    if (alertEnabled && allowed('push') && !isQuietHour(settings)) {
      try {
        const pushed = await sendPushToMember(memberId, { title: item.title, body: item.body, url: item.url, tag: `sla-${item.id}` });
        if (pushed && !pushed.ok && !pushed.expired && pushed.error !== 'No subscriptions') pushError = new Error('Push provider not available');
      } catch { pushError = new Error('Push provider not available'); }
    }
    if (!pushError) await patch(item, { push_done: true });
  }
  if (!item.email_done) {
    if (alertEnabled && allowed('email')) {
      const members = await select(process.env.SUPABASE_TEAM_MEMBERS_TABLE || 'team_members', { select: 'id,name,email', id: `eq.${memberId}`, limit: '1' });
      if (members?.[0]?.email) {
        const result = await sendNotificationEmail({ to: members[0].email, name: members[0].name,
          id: `sla-${item.id}-${memberId}`, title: item.title, body: item.body, url: item.url, category: 'SLA' });
        if (!result.ok) throw new Error('Email provider not available');
      }
    }
    await patch(item, { email_done: true });
  }
  if (pushError) throw pushError;
  await patch(item, { status: 'delivered', lease_token: null, lease_until: null, delivered_at: new Date().toISOString() });
}

async function dispatch() {
  const rows = await supabaseRequest('/rpc/claim_erp_sla_alerts', { method: 'POST', body: { p_limit: 6 }, profileName: 'sla.alert.claim' });
  let delivered = 0;
  for (const item of Array.isArray(rows) ? rows : []) {
    try { await deliver(item); delivered++; }
    catch (error) {
      const attempts = Number(item.attempts || 1);
      await patch(item, { status: attempts >= 5 ? 'failed' : 'pending', lease_token: null, lease_until: null,
        next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60000).toISOString(),
        last_error: 'Provider or storage temporarily unavailable' });
      console.warn('[SLA] Alert delivery deferred', item.id, error?.message);
    }
  }
  return { processed: rows?.length || 0, delivered };
}

/** Invoked only from CRON_SECRET-protected scheduled notifications route. */
export async function runSlaNotificationCycle() {
  try {
    await select(TABLE, { select: 'id', limit: '1' }, { profileName: 'sla.alert.ready' });
  } catch (error) {
    if (missing(error)) return { installed: false };
    throw error;
  }
  let scan = {};
  try { scan = await enqueueAlerts(Date.now()); }
  catch (error) {
    console.warn('[SLA] Candidate scan deferred', error?.message);
    scan = { deferred: 'scan failed' };
  }
  const deliveries = await dispatch();
  return { installed: true, ...scan, ...deliveries };
}
