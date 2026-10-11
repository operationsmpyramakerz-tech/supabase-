import { NextResponse } from 'next/server';
import { getDirectAccountGate } from '../../../../lib/products-auth';
import { canManageSla, SLA_WORKSPACES } from '../../../../lib/home-sla-settings';
import { notificationUsers, canSeeAnyPage } from '../../../../lib/notifications-data';
import { hasSupervisorAccess, SLA_ESCALATION_PAGES } from '../../../../lib/home-sla-escalation.mjs';
import { select, supabaseRequest } from '../../../../lib/supabase-rest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const TABLE = 'erp_sla_escalation_routes';
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function adminGate() {
  const gate = await getDirectAccountGate([]);
  if (!gate.ok) throw Object.assign(new Error(gate.error || 'Authentication required'), { status: gate.status || 401 });
  if (!canManageSla(gate.account)) throw Object.assign(new Error('Admin access required'), { status: 403 });
}
function errorReply(error) {
  const status = [400, 401, 403, 413].includes(Number(error?.status)) ? Number(error.status) : 503;
  return reply({ ok: false, error: status === 503 ? 'Supervisor routes unavailable. Run the Phase 8 SQL migration.' : error.message }, status);
}
export async function GET() {
  try {
    await adminGate();
    const [routes, users, deliveries] = await Promise.all([
      select(TABLE, { select: 'owner_id,supervisor_id,workspace,enabled,updated_at', limit: '501', order: 'updated_at.desc' }),
      notificationUsers(),
      select('erp_sla_alert_outbox', { select: 'status,owner_id,created_at', order: 'created_at.desc', limit: '100' }),
    ]);
    if (routes.length > 500 || users.length > 5000) return reply({ ok: false, error: 'Too many records to safely manage. Contact your administrator.' }, 503);
    const health = { sampled: deliveries.length, pending: 0, processing: 0, delivered: 0, failed: 0, supervisor: 0 };
    for (const row of deliveries) {
      if (Object.hasOwn(health, row.status)) health[row.status]++;
      if (row.owner_id) health.supervisor++;
    }
    return reply({ ok: true, routes, health, users: users.map(u => ({ id: u.id, name: u.name, department: u.department,
      canOwn: SLA_WORKSPACES.filter(w => canSeeAnyPage(u, SLA_ESCALATION_PAGES[w])),
      canSupervise: SLA_WORKSPACES.filter(w => hasSupervisorAccess(u, w)) })) });
  } catch (error) { return errorReply(error); }
}
export async function PUT(request) {
  try {
    await adminGate();
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return reply({ ok: false, error: 'Origin mismatch.' }, 403);
    const raw = await request.text();
    if (raw.length > 2500) return reply({ ok: false, error: 'Payload too large.' }, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return reply({ ok: false, error: 'Invalid JSON.' }, 400); }
    const ownerId = String(input?.owner_id ?? '').trim();
    const recipientId = String(input?.supervisor_id ?? '').trim();
    const workspace = String(input?.workspace ?? '').trim();
    if (!ownerId || !recipientId || ownerId === recipientId || ownerId.length > 200 || recipientId.length > 200 ||
        !SLA_WORKSPACES.includes(workspace) || typeof input.enabled !== 'boolean') {
      return reply({ ok: false, error: 'Choose different team members, a valid workflow, and Enabled or Disabled.' }, 400);
    }
    const users = await notificationUsers();
    const owner = users.find(u => u.id === ownerId);
    const supervisor = users.find(u => u.id === recipientId);
    if (!owner || !canSeeAnyPage(owner, SLA_ESCALATION_PAGES[workspace]) || !supervisor ||
        !hasSupervisorAccess(supervisor, workspace)) {
      return reply({ ok: false, error: 'The owner must have workflow access and the supervisor must have Admin access to that workflow.' }, 400);
    }
    const body = { owner_id: ownerId, supervisor_id: recipientId, workspace, enabled: input.enabled,
      updated_at: new Date().toISOString() };
    const rows = await supabaseRequest(`/${TABLE}?on_conflict=owner_id,supervisor_id,workspace`, {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body, profileName: 'sla.escalation.save',
    });
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Could not store supervisor route.');
    return reply({ ok: true, saved: rows[0] });
  } catch (error) { return errorReply(error); }
}
