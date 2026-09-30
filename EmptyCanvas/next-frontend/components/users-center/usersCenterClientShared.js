"use client";

function text(value) { return String(value ?? "").trim(); }

export async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include", cache: "no-store", ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  if (response.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    const error = new Error("Your session has expired."); error.status = 401; throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) {
    const error = new Error(text(body?.message || body?.error) || "The request failed.");
    error.status = response.status; error.body = body; throw error;
  }
  return body;
}

let usersCenterAuthorization = { token: "", expiresAt: 0 };
export function cacheUsersCenterAuthorization(payload = {}) {
  const tokenValue = text(payload?.authorizationToken);
  if (!tokenValue) { usersCenterAuthorization = { token: "", expiresAt: 0 }; return ""; }
  const expiresAt = Number(payload?.expiresAt) || (Date.now() + Math.max(30, Number(payload?.expiresInSeconds) || 300) * 1000);
  usersCenterAuthorization = { token: tokenValue, expiresAt };
  return tokenValue;
}
export function currentUsersCenterAuthorizationToken() {
  if (!usersCenterAuthorization.token || usersCenterAuthorization.expiresAt <= Date.now() + 1500) { usersCenterAuthorization = { token: "", expiresAt: 0 }; return ""; }
  return usersCenterAuthorization.token;
}
export async function usersCenterMutation(action, payload = {}) {
  const authorizationToken = currentUsersCenterAuthorizationToken();
  if (!authorizationToken) { const error = new Error("Admin verification expired. Please enter the Admin password first."); error.status = 403; throw error; }
  try {
    return await requestJson("/next/api/users-center/mutations-direct", { method: "POST", body: JSON.stringify({ action, ...payload, authorizationToken }) });
  } catch (error) {
    if (error?.status === 403 && /verification|authorization|expired/i.test(error?.message || "")) usersCenterAuthorization = { token: "", expiresAt: 0 };
    throw error;
  }
}
