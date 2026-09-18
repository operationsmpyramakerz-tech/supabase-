import { NextResponse } from "next/server";
import { directKpisContext, kpiErrorMessage, kpisMeta } from "../../../../lib/kpis-data";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const context = await directKpisContext().catch(() => null);
  if (!context) return NextResponse.json({ ok: false, error: "Direct KPI access is unavailable." }, { status: 503 });
  if (!context.ok) return NextResponse.json({ ok: false, error: context.error }, { status: context.status || 403 });
  try {
    const fresh = new URL(request.url).searchParams.get("_fresh") === "1";
    return NextResponse.json(await kpisMeta(context, { force: fresh }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: kpiErrorMessage(error) }, { status: Number(error?.status) || 500 });
  }
}
