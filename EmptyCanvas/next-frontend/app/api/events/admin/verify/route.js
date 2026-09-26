import { NextResponse } from "next/server";

import { eventWorkflowTransition } from "../../../../../lib/events-data";
import { issueEventsAuthorizationToken, EVENTS_AUTHORIZATION_TTL_MS } from "../../../../../lib/events-action-auth";
import { directPageMutationAccess, verifyPageAdminPasswordDirect, verifySharedAdminPasswordDirect } from "../../../../../lib/order-action-auth";
import { getDirectAccountGate } from "../../../../../lib/products-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function uuid(value) {
  const id = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function requestAction(value) {
  const action = text(value).toLowerCase();
  return action === "edit" || action === "cancel" ? action : "";
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const requestedIntent = text(body?.intent).toLowerCase();
  const intent = ["edit", "governorate_rates", "request_workflow", "request_action"].includes(requestedIntent)
    ? requestedIntent
    : "create";
  const requiredPage = intent === "create" || intent === "edit" ? "Event Components" : "Event Requests";
  const gate = await getDirectAccountGate([requiredPage]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const mutationAccess = directPageMutationAccess(gate.account || {}, [requiredPage]);
  if (mutationAccess !== true) {
    return json({ ok: false, error: `${requiredPage} Edit or Admin access is required.` }, { status: mutationAccess === null ? 503 : 403 });
  }

  try {
    const password = text(body?.password || body?.adminPassword);
    if (!password) return json({ ok: false, error: "Admin password is required." }, { status: 400 });

    let verified;
    if (intent === "request_workflow" || intent === "request_action") {
      verified = await verifySharedAdminPasswordDirect(password);
    } else {
      verified = await verifyPageAdminPasswordDirect(gate.account || {}, password, [requiredPage]);
    }
    if (verified === null) return json({ ok: false, error: "The direct Admin password context is unavailable." }, { status: 503 });
    if (!verified) return json({ ok: false, error: "Invalid Admin password." }, { status: 401 });

    const expiresInSeconds = Math.floor(EVENTS_AUTHORIZATION_TTL_MS / 1000);
    if (intent === "request_workflow") {
      const eventId = uuid(body?.eventId || body?.event_id);
      const transition = eventWorkflowTransition(body?.targetStatus || body?.target_status);
      if (!eventId || !transition) return json({ ok: false, error: "Choose a valid event request workflow action." }, { status: 400 });
      return json({
        ok: true,
        intent,
        eventId,
        targetStatus: transition.to,
        authorizationToken: issueEventsAuthorizationToken(gate.account || {}, "events-request-workflow", { eventId, targetStatus: transition.to }),
        expiresInSeconds,
        source: "supabase-next",
      });
    }

    if (intent === "request_action") {
      const eventId = uuid(body?.eventId || body?.event_id);
      const action = requestAction(body?.action);
      if (!eventId || !action) return json({ ok: false, error: "Choose a valid event request action." }, { status: 400 });
      return json({
        ok: true,
        intent,
        eventId,
        action,
        authorizationToken: issueEventsAuthorizationToken(gate.account || {}, "events-request-action", { eventId, action }),
        expiresInSeconds,
        source: "supabase-next",
      });
    }

    if (intent === "governorate_rates") {
      return json({
        ok: true,
        intent,
        authorizationToken: issueEventsAuthorizationToken(gate.account || {}, "events-governorate-rates"),
        expiresInSeconds,
        source: "supabase-next",
      });
    }

    if (intent === "edit") {
      const componentId = uuid(body?.componentId || body?.component_id);
      if (!componentId) return json({ ok: false, error: "Select a valid event component to edit." }, { status: 400 });
      return json({
        ok: true,
        intent,
        componentId,
        authorizationToken: issueEventsAuthorizationToken(gate.account || {}, "events-component-edit", { componentId }),
        expiresInSeconds,
        source: "supabase-next",
      });
    }

    return json({
      ok: true,
      intent: "create",
      authorizationToken: issueEventsAuthorizationToken(gate.account || {}, "events-component-create"),
      expiresInSeconds,
      source: "supabase-next",
    });
  } catch (error) {
    console.error("[events] direct Admin verification failed:", error?.details || error?.message || error);
    return json({ ok: false, error: error?.message || "Failed to verify Admin password." }, { status: Number(error?.status) || 500 });
  }
}
