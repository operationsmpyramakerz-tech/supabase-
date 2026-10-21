import { NextResponse } from 'next/server';
import { getDirectAccountGate } from '../../../../lib/products-auth';
import { canViewSla, canManageSla, readSlaSettings, saveSlaSetting } from '../../../../lib/home-sla-settings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

function reply(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function authorize(permission = "view") {
  const gate = await getDirectAccountGate([]);
  if (!gate.ok) throw Object.assign(new Error(gate.error || 'Authentication required.'), { status: gate.status || 401 });
  if (!(permission === 'manage' ? canManageSla(gate.account) : canViewSla(gate.account))) throw Object.assign(new Error('SLA permission denied.'), { status: 403 });
}
function errorReply(error) {
  const status = [400, 401, 403, 413].includes(Number(error?.status)) ? Number(error.status) : 503;
  return reply({ ok: false, error: status === 503 ? 'SLA settings unavailable. Check Supabase migration and server credentials.' : error.message }, status);
}
export async function GET() {
  try { await authorize(); return reply({ ok: true, ...(await readSlaSettings()) }); }
  catch (error) { return errorReply(error); }
}
export async function PUT(request) {
  try {
    await authorize('manage');
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return reply({ ok: false, error: 'Origin mismatch.' }, 403);
    const content = await request.text();
    if (content.length > 9000) return reply({ ok: false, error: 'Payload too large.' }, 413);
    let input;
    try { input = JSON.parse(content); } catch { return reply({ ok: false, error: 'Invalid JSON.' }, 400); }
    const saved = await saveSlaSetting(input?.type, input?.data);
    return reply({ ok: true, saved });
  } catch (error) { return errorReply(error); }
}
