import { NextResponse } from 'next/server';
import { getDirectAccountGate } from '../../../../lib/products-auth';
import { canManageSla } from '../../../../lib/home-sla-settings';
import { select } from '../../../../lib/supabase-rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CHECKS = [
  ['lifecycle', 'Order lifecycle history', 'erp_order_lifecycle_events'],
  ['policies', 'SLA policies', 'erp_home_sla_policies'],
  ['calendar', 'Working calendar', 'erp_home_sla_calendar'],
  ['alerts', 'SLA alert outbox', 'erp_sla_alert_outbox'],
  ['routes', 'Supervisor routes', 'erp_sla_escalation_routes'],
  ['history', 'Cron execution history', 'erp_sla_cycle_runs'],
];
const response = (body, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export async function GET() {
  try {
    const gate = await getDirectAccountGate([]);
    if (!gate.ok) return response({ ok: false, error: 'Authentication required.' }, gate.status === 403 ? 403 : 401);
    if (!canManageSla(gate.account)) return response({ ok: false, error: 'Admin access required.' }, 403);
    // Fixed names only, no dynamic table parameter and no customer data returned.
    const checks = await Promise.all(CHECKS.map(async ([id, label, table]) => {
      try {
        await select(table, { select: '*', limit: '0' }, {
          profileName: `sla.health.${id}`, timeoutMs: 4000, attempts: 1,
        });
        return { id, label, ok: true, detail: 'Table accessible' };
      } catch {
        return { id, label, ok: false, detail: 'Missing or inaccessible. Check SQL migration and service credentials.' };
      }
    }));
    // A configured secret does not establish whether Vercel actually invokes the cron.
    checks.push({ id: 'cron', label: 'Cron authorization secret',
      ok: Boolean(process.env.CRON_SECRET?.trim()),
      detail: process.env.CRON_SECRET?.trim() ? 'Configured (execution not verified)' : 'Missing CRON_SECRET',
    });
    let lastRun = null;
    if (checks.some(item => item.id === 'history' && item.ok)) {
      try {
        const rows = await select('erp_sla_cycle_runs', {
          select: 'ran_at,status,inspected,candidates,processed,delivered',
          order: 'ran_at.desc', limit: '1',
        }, { profileName: 'sla.health.last-run', timeoutMs: 4000, attempts: 1 });
        lastRun = rows?.[0] || null;
      } catch { /* Table may have been changed after readiness probe. */ }
    }
    const ageMs = lastRun ? Date.now() - Date.parse(lastRun.ran_at) : Infinity;
    checks.push({ id: 'last-run', label: 'Recent SLA cycle',
      ok: Boolean(lastRun && lastRun.status === 'ok' && ageMs >= 0 && ageMs < 36 * 3600000),
      detail: lastRun
        ? `Last recorded ${lastRun.ran_at}; status: ${lastRun.status}; queued: ${lastRun.candidates}; processed: ${lastRun.processed}; delivered: ${lastRun.delivered}`
        : 'No completed cycle recorded. Check the Vercel cron logs after its next run.',
    });
    return response({ ok: true, ready: checks.every(item => item.ok), checks });
  } catch {
    return response({ ok: false, error: 'Diagnostics are temporarily unavailable.' }, 503);
  }
}
