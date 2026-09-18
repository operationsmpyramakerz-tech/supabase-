import { NextResponse } from "next/server";
import { b2cErrorMessage, b2cTablePayload, directB2cContext } from "../../../../../../lib/b2c-data";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const context = await directB2cContext(["Customer Database", "B2C"]).catch(() => null);
  if (!context) return NextResponse.json({ ok: false, error: "Direct B2C access is unavailable." }, { status: 503 });
  if (!context.ok) return NextResponse.json({ ok: false, error: context.error }, { status: context.status || 403 });
  try {
    const resolved = await params;
    const force = new URL(request.url).searchParams.get("_fresh") === "1";
    return NextResponse.json(await b2cTablePayload(resolved?.id, { force }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: b2cErrorMessage(error) }, { status: Number(error?.status) || 500 });
  }
}
