import { NextResponse } from 'next/server';
import { getDirectAccountGate } from '../../../../lib/products-auth';
import { featureGate } from '../../../../lib/feature-permissions-server';
import { projectTestingOverview } from '../../../../lib/preparing-project-testing';
import { warehouseWorkspace } from '../../../../lib/preparing-warehouse';
import { productionWorkspace } from '../../../../lib/preparing-production';
import { calculateProjectPreparationProgress } from '../../../../lib/preparing-project-progress.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

// Project-wide progress is a safe aggregate, with no stage detail or people
// exposed: the underlying stage-specific endpoints separately enforce access.
export async function GET(request) {
  const gate = featureGate(await getDirectAccountGate(['Projects Preparing']), 'preparing.view');
  if (!gate.ok) return reply({ ok: false, error: gate.error || 'Access denied.' }, gate.status || 403);
  try {
    const projectId = new URL(request.url).searchParams.get('projectId');
    if (!projectId) return reply({ ok: false, error: 'Project is required.' }, 400);
    const [testing, warehouse, production] = await Promise.all([
      projectTestingOverview(projectId), warehouseWorkspace(projectId), productionWorkspace(projectId),
    ]);
    return reply({ ok: true, progress: calculateProjectPreparationProgress({ testing, warehouse, production }) });
  } catch (error) {
    console.error('[projects-preparing:progress]', error?.message || error);
    return reply({ ok: false, error: error?.message || 'Unable to load project progress.' }, Number(error?.status) || 500);
  }
}
