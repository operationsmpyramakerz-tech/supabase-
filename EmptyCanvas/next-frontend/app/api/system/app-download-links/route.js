import { NextResponse } from "next/server";
import { buildAppDownloadLinks } from "../../../../lib/app-download-links";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { trustedAppPublicOrigin } from "../../../../lib/app-public-origin.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate?.ok) return NextResponse.json({ error: gate?.error || "Authentication required." }, { status: gate?.status || 401, headers: { "Cache-Control": "no-store" } });
  // Host / X-Forwarded-Host can be changed by clients on misconfigured
  // proxies. Do not return attacker-controlled PWA installation links.
  // Relative links work without deployment configuration.
  const origin = trustedAppPublicOrigin(process.env.ERP_PUBLIC_URL || "");
  return NextResponse.json(buildAppDownloadLinks(origin), { headers: { "Cache-Control": "private, no-store" } });
}
