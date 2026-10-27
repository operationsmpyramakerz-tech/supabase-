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
  return <AppShell account={gate.account} title="Projects Preparing" eyebrow="" activePath="/next/projects-preparing" bodyClass="preparing-page" pageStyles={["/next/css/projects-preparing.css?v=225"]}>
    <PreparingClient account={gate.account} initialData={data} bootstrapError={bootstrapError} />
  </AppShell>;
}
