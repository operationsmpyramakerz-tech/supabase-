import { NextResponse } from "next/server";

import {
  b2cErrorMessage,
  copyB2cDatabase,
  createB2cDatabase,
  createB2cForm,
  deleteB2cDatabase,
  deleteB2cRecord,
  directB2cContext,
  saveB2cFields,
  saveB2cFormBuilder,
  submitB2cForm,
  updateB2cDatabase,
  updateB2cForm,
  updateB2cRecord,
} from "../../../../lib/b2c-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function text(value) { return String(value ?? "").trim(); }
function json(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}

function requiredPages(action) {
  if (["form-create", "form-update", "form-builder-save"].includes(action)) return ["Customer Database", "Customer Form"];
  if (action === "form-submit") return ["Customer Form"];
  return ["Customer Database"];
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action).toLowerCase();
  const context = await directB2cContext(requiredPages(action), { mutation: true }).catch(() => null);
  if (!context) return json({ ok: false, error: "Direct B2C access is unavailable." }, 503);
  if (!context.ok) return json({ ok: false, error: context.error || "B2C access denied." }, context.status || 403);

  try {
    if (action === "database-create") {
      const database = await createB2cDatabase(context, body);
      return json({ ok: true, database, source: "supabase-next" }, 201);
    }
    if (action === "database-update") {
      const database = await updateB2cDatabase(context, body?.databaseId || body?.id, body);
      return json({ ok: true, database, source: "supabase-next" });
    }
    if (action === "database-copy") {
      const database = await copyB2cDatabase(context, body?.databaseId || body?.id);
      return json({ ok: true, database, source: "supabase-next" }, 201);
    }
    if (action === "database-delete") {
      const result = await deleteB2cDatabase(context, body?.databaseId || body?.id);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "fields-save") {
      const fields = await saveB2cFields(context, body?.databaseId || body?.id, body);
      return json({ ok: true, fields, source: "supabase-next" });
    }
    if (action === "form-create") {
      const form = await createB2cForm(context, body);
      return json({ ok: true, form, source: "supabase-next" }, 201);
    }
    if (action === "form-update") {
      const form = await updateB2cForm(context, body?.formId || body?.id, body);
      return json({ ok: true, form, source: "supabase-next" });
    }
    if (action === "form-builder-save") {
      const result = await saveB2cFormBuilder(context, body?.formId || body?.id, body);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    if (action === "form-submit") {
      const record = await submitB2cForm(context, body?.formId || body?.id, body);
      return json({ ok: true, record, source: "supabase-next" }, 201);
    }
    if (action === "record-update") {
      const record = await updateB2cRecord(context, body?.recordId || body?.id, body);
      return json({ ok: true, record, source: "supabase-next" });
    }
    if (action === "record-delete") {
      const result = await deleteB2cRecord(context, body?.recordId || body?.id, body);
      return json({ ok: true, ...result, source: "supabase-next" });
    }
    return json({ ok: false, error: "Unknown B2C action." }, 400);
  } catch (error) {
    console.error("POST /next/api/b2c/mutations-direct error:", error?.details || error);
    return json({ ok: false, error: b2cErrorMessage(error) }, Number(error?.status) || 500);
  }
}
