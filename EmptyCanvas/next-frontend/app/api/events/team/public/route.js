import { NextResponse } from "next/server";

import { uploadEventTeamIdPhoto } from "../../../../../lib/event-team-data";
import {
  createPublicEventTeamSession,
  eventTeamPublicAuthError,
  loginPublicEventTeamMember,
  profileFromPublicEventTeamSession,
  publicEventTeamSessionCookie,
  registerPublicEventTeamMember,
} from "../../../../../lib/event-team-public-auth";

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

function sessionToken(request) {
  return String(request?.cookies?.get?.(publicEventTeamSessionCookie.name)?.value || "").trim();
}

function setSession(response, account) {
  response.cookies.set(publicEventTeamSessionCookie.name, createPublicEventTeamSession(account), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: publicEventTeamSessionCookie.maxAge,
  });
  return response;
}

function clearSession(response) {
  response.cookies.set(publicEventTeamSessionCookie.name, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(request) {
  try {
    const result = await profileFromPublicEventTeamSession(sessionToken(request));
    if (!result?.profile) return json({ ok: false, authenticated: false }, { status: 401 });
    return json({ ok: true, authenticated: true, profile: result.profile });
  } catch (error) {
    console.error("[events-team-public] profile failed:", error?.details || error?.message || error);
    return json({ ok: false, authenticated: false, error: eventTeamPublicAuthError(error), code: error?.code || "" }, { status: Number(error?.status) || 500 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "").trim().toLowerCase();

  try {
    if (action === "signup") {
      const result = await registerPublicEventTeamMember(body?.payload || body);
      const response = json({ ok: true, authenticated: true, profile: result.profile }, { status: 201 });
      return setSession(response, result.account);
    }

    if (action === "login") {
      const result = await loginPublicEventTeamMember(body?.payload || body);
      const response = json({ ok: true, authenticated: true, profile: result.profile });
      return setSession(response, result.account);
    }

    if (action === "logout") {
      return clearSession(json({ ok: true, authenticated: false }));
    }

    if (action === "upload-id") {
      const uploaded = await uploadEventTeamIdPhoto({ dataUrl: body?.dataUrl, fileName: body?.fileName });
      return json({ ok: true, ...uploaded }, { status: 201 });
    }

    return json({ ok: false, error: "Unsupported public Event Team action." }, { status: 400 });
  } catch (error) {
    console.error(`[events-team-public] ${action || "unknown"} failed:`, error?.details || error?.message || error);
    return json({
      ok: false,
      error: eventTeamPublicAuthError(error),
      code: String(error?.code || ""),
    }, { status: Number(error?.status) || 500 });
  }
}
