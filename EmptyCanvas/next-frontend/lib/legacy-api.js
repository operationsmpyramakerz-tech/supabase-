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

function normalizeHttpOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function backendOrigin() {
  const configured = normalizeHttpOrigin(
    process.env.LEGACY_BACKEND_ORIGIN ||
    process.env.LEGACY_BACKEND_INTERNAL_ORIGIN ||
    process.env.LEGACY_BACKEND_PUBLIC_ORIGIN ||
    "",
  );
  if (configured) return configured;
  if (String(process.env.VERCEL || "").trim() === "1") return "";
  return "http://127.0.0.1:5000";
}

export async function fetchLegacyJson(pathname, options = {}) {
  const origin = backendOrigin();
  if (!origin) {
    return {
      ok: false,
      status: 503,
      data: null,
      location: "",
      error: "The ERP backend connection is not configured for this Next.js deployment.",
    };
  }

  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const url = new URL(String(pathname || "/"), origin);
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 8000) || 8000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const hasBody = typeof options.body !== "undefined" && options.body !== null;
  const body = hasBody && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body;

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
        "x-forwarded-proto": headerStore.get("x-forwarded-proto") || "https",
        "x-operations-hub-frontend": "next-pilot",
        ...(hasBody ? { "content-type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      body: hasBody ? body : undefined,
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
