import 'server-only';
import { select } from './supabase-rest';

/** Server-only SLA configuration: no client credentials or mutation endpoint. */
export async function loadHomeSlaPolicies() {
  try {
    const rows = await select('erp_home_sla_policies', {
      select: 'workspace,enabled,target_hours,warning_percent,time_basis',
      order: 'workspace.asc',
      limit: '4',
    }, { timeoutMs: 4000, attempts: 1, profileName: 'home.sla-policies' });
    let calendar = null;
    try {
      const calendars = await select('erp_home_sla_calendar', {
        select: 'id,enabled,timezone,work_days,work_start,work_end,holidays',
        id: 'eq.company', limit: '1',
      }, { timeoutMs: 4000, attempts: 1, profileName: 'home.sla-calendar' });
      calendar = Array.isArray(calendars) ? calendars[0] || null : null;
    } catch { /* Old installs remain elapsed-hours compatible until migration. */ }
    return { state: 'ready', policies: Array.isArray(rows) ? rows : [], calendar };
  } catch (error) {
    const details = [error?.message, error?.details?.message, error?.details?.code].filter(Boolean).join(' ').toLowerCase();
    return { state: /does not exist|could not find|schema cache|pgrst205|42p01/.test(details) ? 'needs-setup' : 'unavailable', policies: [] };
  }
}
