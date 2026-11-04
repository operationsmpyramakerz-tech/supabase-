import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import {
  approveProductAdditionRequest, listProductAdditionRequests, saveProductAdditionRequest,
} from "../../../../lib/product-addition-requests-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const json = (payload, status = 200) => NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
const error = exception => json({ ok: false, error: exception?.message || "Request failed." }, Number(exception?.status) || 500);

export async function GET() {
  const gate = featureGate(await getDirectAccountGate("Products"), "products.create");
  if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status || 403);
  try { return json({ ok: true, requests: await listProductAdditionRequests() }); }
  catch (exception) { return error(exception); }
}

export async function PATCH(request) {
  const gate = featureGate(await getDirectAccountGate("Products"), "products.create");
  if (!gate.ok) return json({ ok: false, error: gate.error }, gate.status || 403);
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ ok: false, error: "Invalid request ID." }, 400);
    if (body?.action === "save") {
      const canUploadImage = featureGate(gate, "products.image_upload").ok;
      return json({ ok: true, request: await saveProductAdditionRequest(id, body?.product || {}, { canUploadImage }) });
    }
    if (body?.action === "approve") {
      // A reviewer who is not allowed to upload images may still approve
      // an image already supplied by the original Shopping Cart requester.
      const result = await approveProductAdditionRequest(id, gate.account);
      return json({ ok: true, ...result });
    }
    return json({ ok: false, error: "Unknown review action." }, 400);
  } catch (exception) { return error(exception); }
}
