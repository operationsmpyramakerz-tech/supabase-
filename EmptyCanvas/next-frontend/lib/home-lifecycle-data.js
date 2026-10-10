import 'server-only';

import { isSupabaseConfigured, select } from './supabase-rest';
import { buildLifecycleAnalytics } from './home-lifecycle-analytics.mjs';
import { buildSlaAnalytics } from './home-sla-analytics.mjs';
import { loadHomeSlaPolicies } from './home-sla-policies';

const MAX_ORDERS = 1200;
const CHUNK_SIZE = 60;
const PAGE_SIZE = 1000;
const MAX_EVENTS_PER_CHUNK = 20000;

/** Read audit events for ONLY the order numbers visible to the signed-in Home. */
export async function loadHomeLifecycleAnalytics(scopes = {}) {
  const ordered = [...new Set(Object.values(scopes).flatMap((scope) =>
    Array.isArray(scope) ? scope.map((order) => String(order.orderNumber)) : []))]
    .filter((number) => /^[1-9]\d*$/.test(number));

  if (ordered.length > MAX_ORDERS) return { state: 'too-many-orders', workspaces: {} };
  if (!isSupabaseConfigured()) return { state: 'unavailable', workspaces: {} };

  try {
    // SLA and processing-time metrics share the same access-scoped audit events.
    // Policies remain disabled until explicitly configured in Supabase.
    const policiesPromise = loadHomeSlaPolicies();
    const events = [];
    for (let i = 0; i < ordered.length; i += CHUNK_SIZE) {
      const numbers = ordered.slice(i, i + CHUNK_SIZE);
      let offset = 0;
      for (;;) {
        const chunk = await select('erp_order_lifecycle_events', {
          select: 'id,order_number,row_id,event_type,occurred_at,status,sv_approval,operations_approval',
          order_number: `in.(${numbers.join(',')})`,
          order: 'id.asc',
          limit: String(PAGE_SIZE),
          offset: String(offset),
        }, { timeoutMs: 5000, attempts: 1, profileName: 'home.lifecycle-audit' });
        const page = Array.isArray(chunk) ? chunk : [];
        events.push(...page);
        offset += page.length;
        if (page.length < PAGE_SIZE) break;
        // Fail closed instead of showing silently truncated completion samples.
        if (offset >= MAX_EVENTS_PER_CHUNK) return { state: 'too-many-events', workspaces: {} };
      }
    }
    const policyResult = await policiesPromise;
    const sla = policyResult.state === 'ready'
      ? buildSlaAnalytics(scopes, events, policyResult.policies)
      : { state: policyResult.state, workspaces: {} };
    return { state: 'ready', workspaces: buildLifecycleAnalytics(scopes, events), sla }; 
  } catch (error) {
    const body = [error?.message, error?.details?.message, error?.details?.code].filter(Boolean).join(' ').toLowerCase();
    const missing = /does not exist|could not find|schema cache|pgrst205|42p01/.test(body);
    return { state: missing ? 'needs-setup' : 'unavailable', workspaces: {} };
  }
}
