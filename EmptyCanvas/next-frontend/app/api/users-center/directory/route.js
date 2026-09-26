import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { usersCenterDirectory } from "../../../../lib/users-center-data";
import { measurePerformance } from "../../../../lib/performance-profiler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];

async function GETImpl(request) {
  const gate = await getDirectAccountGate(ACCESS_PAGES);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error || "Access denied." }, { status: gate.status || 503 });
  }

  try {
    const fresh = request.nextUrl.searchParams.get("fresh") === "1";
    return NextResponse.json(await usersCenterDirectory({ fresh }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("GET /next/api/users-center/directory error:", error?.details || error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load Users Center directory." },
      { status: Number(error?.status) || 500 },
    );
  }
}

export async function GET(request) {
  return await measurePerformance("route", "users-center.directory", async () => await GETImpl(request), { method: "GET" });
}
