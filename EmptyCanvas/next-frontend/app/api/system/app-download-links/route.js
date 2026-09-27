import { NextResponse } from "next/server";
import { buildAppDownloadLinks } from "../../../../lib/app-download-links";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate?.ok) return NextResponse.json({ error: gate?.error || "Authentication required." }, { status: gate?.status || 401, headers: { "Cache-Control": "no-store" } });
  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").split(",")[0].trim();
  const forwardedHost = String(request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
  const origin = forwardedHost ? `${forwardedProto || "https"}://${forwardedHost}` : new URL(request.url).origin;
  return NextResponse.json(buildAppDownloadLinks(origin), { headers: { "Cache-Control": "no-store" } });
}
