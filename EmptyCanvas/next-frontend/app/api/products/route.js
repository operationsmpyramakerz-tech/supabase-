import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../lib/products-auth";
import { createProduct, deleteProduct, getProduct, getProductsCatalog, updateProduct } from "../../../lib/products-service";
import { measurePerformance } from "../../../lib/performance-profiler";

export const dynamic = "force-dynamic";

function gateResponse(gate) {
  return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status || 503 });
}

function errorResponse(error, fallback) {
  return NextResponse.json(
    { ok: false, error: error?.message || fallback },
    { status: Number(error?.status) || 500 },
  );
}

async function GETImpl(request) {
  const gate = await getDirectAccountGate(["Products", "Proposals"]);
  if (!gate.ok) return gateResponse(gate);

  try {
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (id) {
      const product = await getProduct(id);
      if (!product) {
        return NextResponse.json(
          { ok: false, error: "Product not found." },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.json(
        { ok: true, source: "supabase-next", product },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    const fresh = url.searchParams.get("_fresh") === "1";
    return NextResponse.json(await getProductsCatalog({ fresh }), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/products error:", error?.details || error);
    return errorResponse(error, "Failed to load products from Supabase.");
  }
}

export async function POST(request) {
  const gate = await getDirectAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);

  try {
    const body = await request.json().catch(() => ({}));
    const product = await createProduct(body);
    return NextResponse.json({ ok: true, source: "supabase-next", product }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("POST /next/api/products error:", error?.details || error);
    return errorResponse(error, "Failed to create product.");
  }
}

export async function GET(request) {
  return await measurePerformance("route", "products.catalog", async () => await GETImpl(request), { method: "GET" });
}

export async function PATCH(request) {
  const gate = await getDirectAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);

  try {
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing product ID." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const existing = await getProduct(id);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Product not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const product = await updateProduct(id, body);
    return NextResponse.json(
      { ok: true, source: "supabase-next", product },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("PATCH /next/api/products error:", error?.details || error);
    return errorResponse(error, "Failed to update product.");
  }
}

export async function DELETE(request) {
  const gate = await getDirectAccountGate("Products");
  if (!gate.ok) return gateResponse(gate);

  try {
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing product ID." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const existing = await getProduct(id);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Product not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    await deleteProduct(id);
    return NextResponse.json(
      { ok: true, source: "supabase-next", deletedId: id },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("DELETE /next/api/products error:", error?.details || error);
    return errorResponse(error, "Failed to delete product.");
  }
}
