import { NextResponse } from "next/server";
import JSZip from "jszip";
import { Readable } from "node:stream";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { getProduct, getProductsStorageBucket } from "../../../../lib/products-service";
import { getSupabaseConfig } from "../../../../lib/supabase-rest";
import { archiveEntries, fetchArchiveEntries, productArchiveName } from "../../../../lib/product-attachments-archive.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  // The link is displayed in Kits; retain its existing view permission here.
  const gate = featureGate(await getDirectAccountGate(["Kits", "Proposals", "Products"]), "kits.view");
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status || 403 });

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
