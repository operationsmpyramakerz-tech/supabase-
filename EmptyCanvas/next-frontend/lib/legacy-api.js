import { cookies, headers } from "next/headers";

function encodeCookie(value) {
  return encodeURIComponent(String(value ?? ""));
}

function cookieHeader(cookieStore) {
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${encodeCookie(cookie.value)}`)
    .join("; ");
}

function backendOrigin() {
  const configured = String(process.env.LEGACY_BACKEND_INTERNAL_ORIGIN || "http://127.0.0.1:5000").trim();
  try {
    return new URL(configured).origin;
  } catch {
    return "http://127.0.0.1:5000";
  }
}

export async function fetchLegacyJson(pathname, options = {}) {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const url = new URL(String(pathname || "/"), backendOrigin());
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 8000) || 8000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        cookie: cookieHeader(cookieStore),
        "x-forwarded-host": headerStore.get("host") || "",
        "x-forwarded-proto": headerStore.get("x-forwarded-proto") || "http",
        "x-operations-hub-frontend": "next-pilot",
        ...(options.headers || {}),
      },
    });

    let data = null;
    const contentType = String(response.headers.get("content-type") || "");
    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => null);
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      location: response.headers.get("location") || "",
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      data: null,
      location: "",
      error: error?.name === "AbortError"
        ? `Legacy API timed out after ${timeoutMs}ms.`
        : (error?.message || "Legacy API is unavailable."),
    };
  } finally {
    clearTimeout(timeout);
  }
}
