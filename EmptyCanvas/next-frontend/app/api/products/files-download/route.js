import { NextResponse } from "next/server";
import JSZip from "jszip";
import { Readable } from "node:stream";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureAllowed, shoppingSourceAllowed } from "../../../../lib/feature-permissions-registry";
import { getProduct, getProductsStorageBucket } from "../../../../lib/products-service";
import { getSupabaseConfig } from "../../../../lib/supabase-rest";
import { archiveEntries, fetchArchiveEntries, productArchiveName } from "../../../../lib/product-attachments-archive.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  // Kits, Proposals and component-enabled Shopping Cart all display these
  // product attachments. Check each module's explicit feature permissions:
  // permission to open one module must not silently grant access to another.
  const kitsGate = await getDirectAccountGate(["Kits", "Proposals", "Products"]);
  const catalogAllowed = kitsGate.ok && (
    featureAllowed(kitsGate.account, "kits.view") ||
    featureAllowed(kitsGate.account, "proposals.view")
  );
  if (!catalogAllowed) {
    // Shopping Cart can legitimately list Products without granting Kits.
    const shoppingGate = await getDirectAccountGate(["Create New Order"]);
    if (!shoppingGate.ok) {
      const status = shoppingGate.status === 401 || kitsGate.status === 401 ? 401
        : shoppingGate.status === 403 && kitsGate.status === 403 ? 403
        : shoppingGate.status || 403;
      return NextResponse.json({ ok: false, error: shoppingGate.error || "Access denied." }, { status });
    }
    if (!featureAllowed(shoppingGate.account, "orders.shopping.view") || !shoppingSourceAllowed(shoppingGate.account, "components")) {
      return NextResponse.json({ ok: false, error: "Product file download is not permitted." }, { status: 403 });
    }
  }

  try {
    const productId = String(new URL(request.url).searchParams.get("id") || "").trim();
    if (!productId) return NextResponse.json({ ok: false, error: "Missing product ID." }, { status: 400 });
    const product = await getProduct(productId);
    if (!product) return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });

    const entries = archiveEntries(product.attachments, {
      supabaseUrl: getSupabaseConfig().url,
      bucket: getProductsStorageBucket(),
    });
    // Fetch every resource successfully before returning a ZIP (never silently
    // generate an incomplete archive when one attachment is unavailable).
    const downloaded = await fetchArchiveEntries(entries);
    const zip = new JSZip();
    for (const file of downloaded) zip.file(file.name, file.content, { binary: true });
    const archiveStream = zip.generateNodeStream({
      type: "nodebuffer", streamFiles: true, compression: "DEFLATE",
      compressionOptions: { level: 3 },
    });
    const filename = productArchiveName(product.name);
    return new NextResponse(Readable.toWeb(archiveStream), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="product-files.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    console.error("GET product attachment archive failed:", cause?.message || cause);
    return NextResponse.json({ ok: false, error: cause?.message || "Could not create the product files archive." }, {
      status: Number(cause?.status) || 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
