import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import ProposalsClient from "../../components/proposals/ProposalsClient";
import { getDirectAccountGate } from "../../lib/products-auth";
import { getProductsCatalog } from "../../lib/products-service";
import { listKitFolders, listKits, listProposals } from "../../lib/proposal-kit-service";
import { listTeamMembersLite } from "../../lib/team-members-service";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  // Run the permission gate and read-only page data in parallel. Ownership
  // flags still use the resolved account, and nothing is rendered on a failed gate.
  const gatePromise = getDirectAccountGate(["Proposals", "Products"]);
  const accountPromise = gatePromise.then((result) => result?.account || {}).catch(() => ({}));
  const dataPromise = Promise.allSettled([
    getProductsCatalog(),
    listProposals(accountPromise),
    listKits(accountPromise),
    listKitFolders(accountPromise),
    listTeamMembersLite(),
  ]);

  const gate = await gatePromise;
  if (gate.status === 401) redirect("/login?next=/next/proposals");
  if (gate.status === 403) {
    return <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>Proposals is not available</h1><p>Your account does not have access to the Proposals or Products module.</p><a className="primary-button" href="/next/home">Return to Home</a></section></main>;
  }
  if (!gate.ok || !gate.account) {
    return <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>The new Proposals page could not load</h1><p>{gate.error || "The authentication service is temporarily unavailable."}</p><div className="actions"><a className="primary-button" href="/next/proposals">Try again</a><a className="secondary-button" href="/next/home">Return to Home</a></div></section></main>;
  }

  const [catalogResult, proposalsResult, kitsResult, kitFoldersResult, membersResult] = await dataPromise;

  const catalog = catalogResult.status === "fulfilled" ? catalogResult.value : { ok: false, products: [], tagsCatalog: [], unitsCatalog: [] };
  const proposals = proposalsResult.status === "fulfilled" ? { ok: true, source: "supabase-next", proposals: proposalsResult.value } : { ok: false, proposals: [] };
  const kits = kitsResult.status === "fulfilled" ? { ok: true, source: "supabase-next", kits: kitsResult.value } : { ok: false, kits: [] };
  const kitFolders = kitFoldersResult.status === "fulfilled" ? { ok: true, source: "supabase-next", folders: kitFoldersResult.value } : { ok: false, folders: [] };
  const members = membersResult.status === "fulfilled"
    ? { ok: true, source: "supabase-next", members: membersResult.value }
    : { ok: false, source: "supabase-next", members: [] };
  const warnings = [];
  if (catalogResult.status === "rejected") warnings.push({ url: "/next/api/products", error: catalogResult.reason?.message || "Products could not load." });
  if (proposalsResult.status === "rejected") warnings.push({ url: "/next/api/products/proposals", error: proposalsResult.reason?.message || "Proposals could not load." });
  if (kitsResult.status === "rejected") warnings.push({ url: "/next/api/products/kits", error: kitsResult.reason?.message || "Kits could not load." });
  if (kitFoldersResult.status === "rejected") warnings.push({ url: "/next/api/products/kit-folders", error: kitFoldersResult.reason?.message || "Kit folders could not load." });
  if (membersResult.status === "rejected") warnings.push({ url: "/next/api/team-members", error: membersResult.reason?.message || "Users Center members could not load." });

  return (
    <AppShell account={gate.account} title="Proposals" eyebrow="Reusable quotation workspace" activePath="/next/proposals" bodyClass="products-page proposals-page" pageStyles={["/next/css/products.css?v=products-manual-image-v1", "/next/css/proposals.css?v=b2b-addname-transparent-pdf-v1"]}>
      <ProposalsClient account={gate.account} initialCatalog={catalog} initialProposals={proposals} initialKits={kits} initialKitFolders={kitFolders} initialMembers={members} bootstrapWarnings={warnings} />
    </AppShell>
  );
}
