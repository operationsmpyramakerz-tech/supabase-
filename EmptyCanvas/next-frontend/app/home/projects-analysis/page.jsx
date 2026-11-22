import { redirect } from 'next/navigation';
import AppShell from '../../../components/AppShell';
import ProjectsPreparingAnalysis from '../../../components/home/ProjectsPreparingAnalysis';
import { getDirectAccountGate } from '../../../lib/products-auth';
import { featureAllowed } from '../../../lib/feature-permissions-registry';
import { featureGate } from '../../../lib/feature-permissions-server';
import { preparingWorkspace } from '../../../lib/preparing-service';
import { analyzePreparingWorkspace } from '../../../lib/home-preparing-analysis.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ProjectsPreparingAnalysisPage() {
  const gate = featureGate(await getDirectAccountGate(['Projects Preparing']), 'preparing.view');
  if (gate.status === 401) redirect('/login?next=/next/home/projects-analysis');
  if (!gate.ok || !gate.account || !featureAllowed(gate.account, 'home.view')) {
    return <main className="standalone-state"><section className="state-card"><h1>Projects Preparing Analysis</h1><p>Access is not permitted for this page.</p><a href="/next/home">Return to Home</a></section></main>;
  }
  let data = null;
  let error = '';
  try { data = analyzePreparingWorkspace(await preparingWorkspace()); }
  catch (cause) { error = cause?.message || 'Projects Preparing analysis could not be loaded.'; }

  return <AppShell account={gate.account} title="Projects Analysis" activePath="/next/home" bodyClass="page-home">
    {data ? <ProjectsPreparingAnalysis summary={data} /> : <section className="home-preparing-detail home-preparing-detail__error" role="alert"><h1>Projects Preparing Analysis</h1><p>{error}</p><a href="/next/projects-preparing">Open Projects Preparing</a></section>}
  </AppShell>;
}
