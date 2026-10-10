import 'server-only';
import { select } from './supabase-rest';

/** Server-only SLA configuration: no client credentials or mutation endpoint. */
export async function loadHomeSlaPolicies() {
  try {
    const rows = await select('erp_home_sla_policies', {
      select: 'workspace,enabled,target_hours,warning_percent',
      order: 'workspace.asc',
      limit: '4',
    }, { timeoutMs: 4000, attempts: 1, profileName: 'home.sla-policies' });
    return { state: 'ready', policies: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    const details = [error?.message, error?.details?.message, error?.details?.code].filter(Boolean).join(' ').toLowerCase();
    return { state: /does not exist|could not find|schema cache|pgrst205|42p01/.test(details) ? 'needs-setup' : 'unavailable', policies: [] };
  }
}
