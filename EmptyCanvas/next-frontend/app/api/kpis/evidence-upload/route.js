import { NextResponse } from "next/server";

import { directKpisContext } from "../../../../lib/kpis-data";
import { createSignedUploadUrl } from "../../../../lib/supabase-rest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}
function text(value) { return String(value ?? "").trim(); }
function safeName(value) {
  return (text(value) || "evidence-file").replace(/[^a-z0-9._-]/gi, "_").replace(/^_+|_+$/g, "") || "evidence-file";
}

export async function POST(request) {
  const context = await directKpisContext().catch(() => null);
  if (!context?.ok) return json({ ok: false, error: context?.error || "KPI access denied." }, context?.status || 503);
  try {
    const body = await request.json().catch(() => ({}));
    const size = Number(body?.size || 0);
    if (!Number.isFinite(size) || size <= 0) return json({ ok: false, error: "Evidence file is required." }, 400);
    if (size > 15 * 1024 * 1024) return json({ ok: false, error: "Evidence file must be 15 MB or smaller." }, 400);
    const originalName = text(body?.filename || body?.name || "evidence-file");
    const filename = safeName(originalName);
    const objectPath = `kpi-evidence/${Date.now()}-${Math.random().toString(16).slice(2)}-${filename}`;
    const ticket = await createSignedUploadUrl(objectPath);
    return json({
      ok: true,
      file: { name: originalName || filename, url: ticket.publicUrl },
      upload: { signedUrl: ticket.signedUrl, method: "PUT", headers: { "Content-Type": text(body?.mime) || "application/octet-stream" } },
      source: "supabase-next",
    }, 201);
  } catch (error) {
    return json({ ok: false, error: error?.message || "Failed to prepare evidence upload." }, Number(error?.status) || 500);
  }
}
