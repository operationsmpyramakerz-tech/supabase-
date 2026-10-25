import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { getProductsCatalog } from "../../../../lib/products-service";
import { renderProductCatalogCsv } from "../../../../lib/products-catalog-export.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const gate = featureGate(featureGate(await getDirectAccountGate("Products"), "products.view"), "products.export");
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error || "Access denied." }, {
    status: gate.status || 503, headers: { "Cache-Control": "private, no-store" },
  });
  try {
    const catalog = await getProductsCatalog({ fresh: true });
    if (catalog?.ok !== true) throw new Error("Product catalog is unavailable.");
    const csv = renderProductCatalogCsv(catalog.products);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="products-catalog.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || "Product export failed." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
