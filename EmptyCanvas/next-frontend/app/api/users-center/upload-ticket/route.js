import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { getDirectAccountGate } from "../../../../lib/products-auth";
import { createSignedUploadUrl } from "../../../../lib/supabase-rest";
import { verifyUsersCenterAuthorizationToken } from "../../../../lib/users-center-action-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const ACCESS_PAGES = ["Users Center", "User Access & Data", "User Access", "Team Members"];
const MAX_BYTES = 12 * 1024 * 1024;

function text(value) { return String(value ?? "").trim(); }
function json(payload, status = 200) { return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } }); }
function safeName(value) { return (text(value) || "upload.bin").replace(/[^a-z0-9._-]/gi, "_"); }

export async function POST(request) {
  const gate = await getDirectAccountGate(ACCESS_PAGES);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Access denied." }, gate.status || 503);

  try {
    const body = await request.json().catch(() => ({}));
    verifyUsersCenterAuthorizationToken(body?.authorizationToken, gate.account || {});
    const size = Math.max(0, Number(body?.size) || 0);
    const mime = text(body?.mime || "application/octet-stream");
    const kind = text(body?.kind || "file").toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "file";
    const filename = text(body?.filename) || "upload.bin";

    if (!size) return json({ ok: false, error: "File data is required." }, 400);
    if (size > MAX_BYTES) return json({ ok: false, error: "File is too large. Maximum size is 12MB." }, 413);
    if (kind.includes("profile") && !/^image\//i.test(mime)) return json({ ok: false, error: "Profile picture must be an image." }, 400);

    const objectPath = `team-members/${kind}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName(filename)}`;
    const ticket = await createSignedUploadUrl(objectPath);
    return json({
      ok: true,
      url: ticket.publicUrl,
      name: filename,
      mime,
      upload: {
        method: "PUT",
        signedUrl: ticket.signedUrl,
        publicUrl: ticket.publicUrl,
        headers: { "x-upsert": "false" },
        cacheControl: "3600",
        bucket: ticket.bucket,
        path: ticket.path,
      },
      source: "supabase-next",
    });
  } catch (error) {
    console.error("POST /next/api/users-center/upload-ticket error:", error?.details || error);
    const message = /bucket|storage/i.test(String(error?.message || ""))
      ? "Supabase Storage is not configured. Add SUPABASE_STORAGE_BUCKET in Vercel."
      : (error?.message || "Failed to prepare file upload.");
    return json({ ok: false, error: message }, Number(error?.status) || 500);
  }
}
