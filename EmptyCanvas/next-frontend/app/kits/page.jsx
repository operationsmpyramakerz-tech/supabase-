import { redirect } from "next/navigation";
import AppShell from "../../components/AppShell";
import KitsClient from "../../components/kits/KitsClient";
import { getLegacyAccountGate } from "../../lib/products-auth";
import { getProductsCatalog } from "../../lib/products-service";
import { listKitFolders, listKits } from "../../lib/proposal-kit-service";

export const dynamic = "force-dynamic";

export default async function KitsPage() {
  // Start authentication and the read-only Supabase queries together. The data
  // promise is not consumed/rendered until the permission gate succeeds.
  const gatePromise = getLegacyAccountGate(["Kits", "Proposals", "Products"]);
  const accountPromise = gatePromise.then((result) => result?.account || {}).catch(() => ({}));
  const dataPromise = Promise.allSettled([
    getProductsCatalog(),
    listKits(accountPromise),
    listKitFolders(accountPromise),
  ]);

  const gate = await gatePromise;
  if (gate.status === 401) redirect("/login?next=/next/kits");
  if (gate.status === 403) {
    return <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>Kits is not available</h1><p>Your account does not have access to the Kits, Proposals or Products module.</p><a className="primary-button" href="/next/home">Return to Home</a></section></main>;
  }
  if (!gate.ok || !gate.account) {
    return <main className="standalone-state"><section className="state-card"><span className="status-dot warning" /><h1>The new Kits page could not load</h1><p>{gate.error || "The authentication service is temporarily unavailable."}</p><div className="actions"><a className="primary-button" href="/next/kits">Try again</a><a className="secondary-button" href="/next/home">Return to Home</a></div></section></main>;
  }

  const [catalogResult, kitsResult, foldersResult] = await dataPromise;
  const catalog = catalogResult.status === "fulfilled" ? catalogResult.value : { ok: false, products: [], tagsCatalog: [], unitsCatalog: [] };
  const kits = kitsResult.status === "fulfilled" ? { ok: true, source: "supabase-next", kits: kitsResult.value } : { ok: false, kits: [] };
  const folders = foldersResult.status === "fulfilled" ? { ok: true, source: "supabase-next", folders: foldersResult.value } : { ok: false, folders: [] };
  const warnings = [];
  if (catalogResult.status === "rejected") warnings.push({ url: "/next/api/products", error: catalogResult.reason?.message || "Products could not load." });
  if (kitsResult.status === "rejected") warnings.push({ url: "/next/api/products/kits", error: kitsResult.reason?.message || "Kits could not load." });
  if (foldersResult.status === "rejected") warnings.push({ url: "/next/api/products/kit-folders", error: foldersResult.reason?.message || "Kit folders could not load." });

  return (
    <AppShell account={gate.account} title="Kits" eyebrow="Reusable product bundles" activePath="/next/kits" bodyClass="products-page proposals-page kits-page" pageStyles={["/next/css/products.css?v=products-manual-image-v1", "/next/css/proposals.css?v=b2b-addname-transparent-pdf-v1"]}>
      <KitsClient account={gate.account} initialCatalog={catalog} initialKits={kits} initialFolders={folders} bootstrapWarnings={warnings} />
    </AppShell>
  );
}
