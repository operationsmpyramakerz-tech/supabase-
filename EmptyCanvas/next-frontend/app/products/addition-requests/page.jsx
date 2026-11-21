import { redirect } from "next/navigation";
import AppShell from "../../../components/AppShell";
import ProductAdditionReviewClient from "../../../components/products/ProductAdditionReviewClient";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { featureGate } from "../../../lib/feature-permissions-server";
import { featureAllowed } from "../../../lib/feature-permissions-registry";
import { getProductsCatalog } from "../../../lib/products-service";

export const dynamic = "force-dynamic";
export default async function ProductAdditionReviewPage() {
  const gate = featureGate(await getDirectAccountGate("Products"), "products.create");
  if (gate.status === 401) redirect("/login?next=/next/products/addition-requests");
  if (!gate.ok) return <main className="standalone-state"><section className="state-card"><h1>Product requests unavailable</h1><p>{gate.error || "Products creation permission is required."}</p><a href="/next/products" className="primary-button">Back to Products</a></section></main>;
  const catalog = await getProductsCatalog().catch(() => ({ tagsCatalog: [], unitsCatalog: [] }));
  return <AppShell
    account={gate.account}
    title="Product Addition Requests"
    activePath="/next/products"
    bodyClass="products-page"
    pageStyles={["/next/css/products.css?v=products-toolbar-v334", "/next/css/product-additions.css?v=dialog-controls-v7", "/next/css/product-addition-review-v2.css?v=requested-x-buttons-v9"]}
  >
    <ProductAdditionReviewClient
      canUploadImage={featureAllowed(gate.account, "products.image_upload")}
      tagsCatalog={catalog.tagsCatalog}
      unitsCatalog={catalog.unitsCatalog}
    />
  </AppShell>;
}
