import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import PreparingClient from "../../components/preparing/PreparingClient";
import { getDirectAccountGate } from "../../lib/products-auth";
import { featureGate } from "../../lib/feature-permissions-server";
import { preparingCatalog, preparingWorkspace } from "../../lib/preparing-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function ProjectsPreparingPage() {
  const gate = featureGate(await getDirectAccountGate(["Projects Preparing"]), "preparing.view");
  if (gate.status === 401) redirect("/login?next=/next/projects-preparing");
  if (!gate.ok || !gate.account) {
    return <main className="standalone-state"><section className="state-card"><h1>Projects Preparing</h1><p>{gate.error || "Access denied."}</p><a className="primary-button" href="/next/home">Return to Home</a></section></main>;
  }
  let data = { projects: [], schools: [], stages: [], members: [], proposals: [] };
  let bootstrapError = "";
  try { const [workspace, catalog] = await Promise.all([preparingWorkspace(), preparingCatalog()]); data = { ...workspace, ...catalog }; }
  catch (error) { bootstrapError = error?.message || "Unable to load Preparing tables."; }
  return <AppShell account={gate.account} title="Projects Preparing" eyebrow="" activePath="/next/projects-preparing" bodyClass="preparing-page" pageStyles={["/next/css/projects-preparing.css?v=274-pbom-compact-black-v275-solid-kpi-v276-solid-kit-icons-v277-clean-search-close-v278-testing-parity-v279-testing-controls-v280-testing-filter-popover-v281-filter-icon-center-remaining-clock-v282-warehouse-ui-v284-production-ui-v285-box-ui-v287-box-labels-modal-v288-centered-menu-icons-v296-inline-components-tab-v298-stages-overview-reports-v299-matched-index-tabs-icons-v300-header-path-school-tile-v301-compact-schools-folders-v303-granular-stage-permissions"]}>
    <PreparingClient account={gate.account} initialData={data} bootstrapError={bootstrapError} />
  </AppShell>;
}
