import Link from 'next/link';
import { getDirectAccountGate } from '../../lib/products-auth';
import { featureGate } from '../../lib/feature-permissions-server';
import { preparingWorkspace } from '../../lib/preparing-service';
import { analyzePreparingWorkspace } from '../../lib/home-preparing-analysis.mjs';

// Runs as an async, Suspense-streamed server component after Home's normal
// dashboard has been rendered. Its gate is exactly the Preparing page's gate.
export default async function PreparingHomePanel() {
  const gate = featureGate(await getDirectAccountGate(['Projects Preparing']), 'preparing.view');
  if (!gate.ok || !gate.account) return null;

  let summary;
  try {
    summary = analyzePreparingWorkspace(await preparingWorkspace());
  } catch (error) {
    console.warn('[home-preparing-analysis] Read-only preparing summary unavailable:', error?.message || error);
    return <section className="home-preparing-mini home-preparing-mini--error" aria-label="Preparing analysis unavailable">
      <div className="home-preparing-mini__heading"><span className="home-preparing-mini__eyebrow">PROJECTS PREPARING</span><h2>Projects overview</h2></div>
      <p>Project analysis is temporarily unavailable.</p>
      <Link href="/projects-preparing">Open Projects Preparing</Link>
    </section>;
  }

  const totals = summary.totals;
  return <section className="home-preparing-mini" aria-label="Projects Preparing analysis">
    <div className="home-preparing-mini__top">
      <div className="home-preparing-mini__heading">
        <span className="home-preparing-mini__eyebrow"><span aria-hidden="true">▣</span> PROJECTS PREPARING INSIGHTS</span>
        <h2>Project preparation</h2>
        <p>Project and school preparation status from the current workflow.</p>
      </div>
      <Link className="home-preparing-mini__more" href="/home/projects-analysis">View all analysis <span aria-hidden="true">→</span></Link>
    </div>
    <div className="home-preparing-mini__numbers">
      <div><span>Total projects</span><strong>{totals.projects}</strong></div>
      <div><span>Active</span><strong>{totals.active}</strong></div>
      <div><span>Delivered</span><strong>{totals.delivered}</strong></div>
      <div><span>Closed</span><strong>{totals.closed}</strong></div>
    </div>
    <div className="home-preparing-mini__progress-head"><span>School workflow stage completion</span><strong>{totals.stagePercent}%</strong></div>
    <div className="home-preparing-mini__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={totals.stagePercent} aria-label="School workflow stage completion"><span style={{ width: `${totals.stagePercent}%` }} /></div>
    <p className="home-preparing-mini__foot">{totals.schools} schools · {totals.closedSchools} closed · {totals.blockedSchools} blocked</p>
  </section>;
}
