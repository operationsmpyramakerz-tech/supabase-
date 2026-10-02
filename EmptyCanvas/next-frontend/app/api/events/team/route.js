import { NextResponse } from "next/server";

import {
  createEventTeamAttendance,
  createEventTeamMember,
  deleteEventTeamAttendance,
  deleteEventTeamMember,
  eventTeamDataError,
  listEventTeamAttendance,
  listEventTeamMembers,
  updateEventTeamAttendance,
  updateEventTeamMember,
  uploadEventTeamIdPhoto,
} from "../../../../lib/event-team-data";
import { listEvents } from "../../../../lib/events-data";
import { directPageMutationAccess } from "../../../../lib/order-action-auth";
import { getDirectAccountGate } from "../../../../lib/products-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const EVENT_ACCESS_PAGES = ["Event Requests", "Event Calendar", "Event Components"];

function json(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers || {}) },
  });
}

function text(value) {
  return String(value ?? "").trim();
}

export async function GET() {
  const gate = await getDirectAccountGate(EVENT_ACCESS_PAGES);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  try {
    const [members, attendance, events] = await Promise.all([
      listEventTeamMembers(),
      listEventTeamAttendance(),
      listEvents({ includeArchived: true }),
    ]);
    return json({ ok: true, members, attendance, events, source: "supabase-next" });
  } catch (error) {
    console.error("[events-team] list failed:", error?.details || error?.message || error);
    return json({ ok: false, members: [], attendance: [], events: [], error: eventTeamDataError(error) }, { status: Number(error?.status) || 502 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action).toLowerCase();
  const gate = await getDirectAccountGate(EVENT_ACCESS_PAGES);
  if (!gate.ok) return json({ ok: false, error: gate.error || "Authentication required." }, { status: gate.status || 503 });

  const mutationAccess = directPageMutationAccess(gate.account || {}, EVENT_ACCESS_PAGES);
  if (mutationAccess !== true) {
    return json({ ok: false, error: "Events Edit or Admin access is required." }, { status: mutationAccess === null ? 503 : 403 });
  }

  try {
    if (action === "create-member") {
      const member = await createEventTeamMember(body?.payload || body, gate.account || {});
      return json({ ok: true, member, source: "supabase-next" }, { status: 201 });
    }
    if (action === "update-member") {
      const member = await updateEventTeamMember(body?.id || body?.memberId, body?.payload || body, gate.account || {});
      return json({ ok: true, member, source: "supabase-next" });
    }
    if (action === "delete-member") {
      const member = await deleteEventTeamMember(body?.id || body?.memberId);
      return json({ ok: true, member, source: "supabase-next" });
    }
    if (action === "create-attendance") {
      const attendance = await createEventTeamAttendance(body?.payload || body, gate.account || {});
      return json({ ok: true, attendance, source: "supabase-next" }, { status: 201 });
    }
    if (action === "update-attendance") {
      const attendance = await updateEventTeamAttendance(body?.id || body?.attendanceId, body?.payload || body, gate.account || {});
      return json({ ok: true, attendance, source: "supabase-next" });
    }
    if (action === "delete-attendance") {
      const attendance = await deleteEventTeamAttendance(body?.id || body?.attendanceId);
      return json({ ok: true, attendance, source: "supabase-next" });
    }
    if (action === "upload-id") {
      const uploaded = await uploadEventTeamIdPhoto({ dataUrl: body?.dataUrl, fileName: body?.fileName });
      return json({ ok: true, ...uploaded, source: "supabase-next" }, { status: 201 });
    }
    return json({ ok: false, error: "Unsupported Event Team action." }, { status: 400 });
  } catch (error) {
    console.error(`[events-team] mutation ${action || "unknown"} failed:`, error?.details || error?.message || error);
    return json({ ok: false, error: eventTeamDataError(error) }, { status: Number(error?.status) || 500 });
  }
}
