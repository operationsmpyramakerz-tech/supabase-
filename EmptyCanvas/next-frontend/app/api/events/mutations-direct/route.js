import { NextResponse } from "next/server";

import {
  archiveEventRequest,
  cancelEventRequest,
  createEventComponent,
  createEventRequest,
  createEventTypeOption,
  deleteEventComponent,
  eventWorkflowTransition,
  eventsDataError,
  hasEventComponentsAdminAccess,
  hasEventRequestsAdminAccess,
  saveGovernorateRates,
  transitionEventRequest,
  updateEventComponent,
  updateEventRequest,
  uploadEventComponentAsset,
} from "../../../../lib/events-data";
import { verifyEventsAuthorizationToken } from "../../../../lib/events-action-auth";
import { directPageMutationAccess } from "../../../../lib/order-action-auth";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

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

function actionPage(action = "") {
  return ["create-component", "update-component", "delete-component", "upload-photo", "upload-file"].includes(action)
    ? "Event Components"
    : "Event Requests";
}

function requireToken(body, account, scope, claims = {}) {
  return verifyEventsAuthorizationToken(body?.authorizationToken || body?.adminToken || "", account || {}, scope, claims);
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action).toLowerCase();
  const page = actionPage(action);
  const gate = await getDirectAccountGate([page]);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const mutationAccess = directPageMutationAccess(gate.account || {}, [page]);
  if (mutationAccess !== true) {
    return json({ ok: false, error: `${page} Edit or Admin access is required.` }, { status: mutationAccess === null ? 503 : 403 });
  }

  try {
    if (action === "create-event") {
      const event = await createEventRequest(body?.payload || body, gate.account || {});
      return json({ ok: true, event, source: "supabase-next" }, { status: 201 });
    }

    if (action === "update-event") {
      const eventId = uuid(body?.eventId || body?.id);
      if (!eventId) return json({ ok: false, error: "Invalid event ID." }, { status: 400 });
      if (!hasEventRequestsAdminAccess(gate.account || {})) {
        requireToken(body, gate.account, "events-request-action", { eventId, action: "edit" });
      }
      const event = await updateEventRequest(eventId, body?.payload || body, gate.account || {});
      return json({ ok: true, event, source: "supabase-next" });
    }

    if (action === "workflow-transition") {
      const eventId = uuid(body?.eventId || body?.id);
      const transition = eventWorkflowTransition(body?.targetStatus || body?.target_status);
      if (!eventId || !transition) return json({ ok: false, error: "Invalid event request workflow action." }, { status: 400 });
      requireToken(body, gate.account, "events-request-workflow", { eventId, targetStatus: transition.to });
      const result = await transitionEventRequest(eventId, transition.to);
      return json({ ok: true, ...result, source: "supabase-next" });
    }

    if (action === "request-action") {
      const eventId = uuid(body?.eventId || body?.id);
      const requestAction = text(body?.requestAction || body?.eventAction || body?.requestedAction).toLowerCase();
      if (!eventId || requestAction !== "cancel") return json({ ok: false, error: "Invalid event request action." }, { status: 400 });
      requireToken(body, gate.account, "events-request-action", { eventId, action: "cancel" });
      const event = await cancelEventRequest(eventId);
      return json({ ok: true, action: "cancel", event, source: "supabase-next" });
    }

    if (action === "archive-event") {
      if (!hasEventRequestsAdminAccess(gate.account || {})) {
        return json({ ok: false, error: "Event Requests Admin access is required to archive event requests." }, { status: 403 });
      }
      const event = await archiveEventRequest(body?.eventId || body?.id);
      return json({ ok: true, event, source: "supabase-next" });
    }

    if (action === "create-type") {
      const type = await createEventTypeOption(body?.label || body?.name);
      return json({ ok: true, type, source: "supabase-next" }, { status: 201 });
    }

    if (action === "save-governorate-rates") {
      if (!hasEventRequestsAdminAccess(gate.account || {})) {
        requireToken(body, gate.account, "events-governorate-rates");
      }
      const rates = await saveGovernorateRates(body?.payload || body, gate.account || {});
      return json({ ok: true, rates, source: "supabase-next" });
    }

    if (action === "create-component") {
      if (!hasEventComponentsAdminAccess(gate.account || {})) {
        requireToken(body, gate.account, "events-component-create");
      }
      const component = await createEventComponent(body?.payload || body);
      return json({ ok: true, component, source: "supabase-next" }, { status: 201 });
    }

    if (action === "update-component") {
      const componentId = uuid(body?.componentId || body?.id);
      if (!componentId) return json({ ok: false, error: "Invalid component ID." }, { status: 400 });
      if (!hasEventComponentsAdminAccess(gate.account || {})) {
        requireToken(body, gate.account, "events-component-edit", { componentId });
      }
      const component = await updateEventComponent(componentId, body?.payload || body);
      return json({ ok: true, component, source: "supabase-next" });
    }

    if (action === "delete-component") {
      if (!hasEventComponentsAdminAccess(gate.account || {})) {
        return json({ ok: false, error: "Event Components Admin access is required to manage event components." }, { status: 403 });
      }
      await deleteEventComponent(body?.componentId || body?.id);
      return json({ ok: true, source: "supabase-next" });
    }

    if (action === "upload-photo" || action === "upload-file") {
      const componentId = uuid(body?.componentId || body?.component_id);
      if (!hasEventComponentsAdminAccess(gate.account || {})) {
        if (componentId) requireToken(body, gate.account, "events-component-edit", { componentId });
        else requireToken(body, gate.account, "events-component-create");
      }
      const uploaded = await uploadEventComponentAsset({
        kind: action === "upload-photo" ? "photo" : "file",
        dataUrl: body?.dataUrl || body?.data_url,
        fileName: body?.fileName || body?.file_name,
      });
      return json({ ok: true, ...uploaded, source: "supabase-next" }, { status: 201 });
    }

    return json({ ok: false, error: "Unsupported Events mutation." }, { status: 400 });
  } catch (error) {
    console.error(`[events] direct mutation ${action || "unknown"} failed:`, error?.details || error?.message || error);
    const message = error?.code === "EVENTS_AUTHORIZATION_FAILED"
      ? (error?.message || "Events Admin authorization is required.")
      : eventsDataError(error);
    return json({ ok: false, error: message }, { status: Number(error?.status) || 500 });
  }
}
