import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import ProposalsClient from "../../components/proposals/ProposalsClient";
import { fetchLegacyJson } from "../../lib/legacy-api";

export const dynamic = "force-dynamic";

function resourceMap(bundle) {
  const map = new Map();
  for (const resource of Array.isArray(bundle?.resources) ? bundle.resources : []) {
    map.set(String(resource?.url || ""), resource?.body);
  }
  return map;
}

function getResource(map, prefix, fallback = null) {
  for (const [url, body] of map.entries()) {
    if (url === prefix || url.startsWith(prefix)) return body;
  }
  return fallback;
}

export default async function ProposalsPage() {
  const response = await fetchLegacyJson("/api/page-bootstrap?scope=proposals", { timeoutMs: 45000 });

  if (response.status === 401) redirect("/login?next=/next/proposals");
  if (response.status === 403) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>Proposals is not available</h1>
          <p>Your account does not have access to the Proposals or Products module.</p>
          <a className="primary-button" href="/next/home">Return to Home</a>
        </section>
      </main>
    );
  }

  if (!response.ok || !response.data?.ok) {
    return (
      <main className="standalone-state">
        <section className="state-card">
          <span className="status-dot warning" />
          <h1>The new Proposals page could not load</h1>
          <p>{response.error || response.data?.error || "The current ERP API is temporarily unavailable."}</p>
          <div className="actions">
            <a className="primary-button" href="/proposals">Open classic Proposals</a>
            <a className="secondary-button" href="/next/home">Return to Home</a>
          </div>
        </section>
      </main>
    );
  }

  const resources = resourceMap(response.data);
  const account = getResource(resources, "/api/account", null);
  const catalog = getResource(resources, "/api/products", { ok: true, products: [], tagsCatalog: [], unitsCatalog: [] });
  const proposals = getResource(resources, "/api/products/proposals", { ok: true, proposals: [] });
  const kits = getResource(resources, "/api/products/kits", { ok: true, kits: [] });
  const members = getResource(resources, "/api/products/proposals/team-members", { ok: true, members: [] });

  if (!account) redirect("/login?next=/next/proposals");

  return (
    <AppShell account={account} title="Proposals" eyebrow="Reusable quotation workspace" activePath="/next/proposals">
      <ProposalsClient
        account={account}
        initialCatalog={catalog}
        initialProposals={proposals}
        initialKits={kits}
        initialMembers={members}
        bootstrapWarnings={response.data.omitted || []}
      />
    </AppShell>
  );
}
