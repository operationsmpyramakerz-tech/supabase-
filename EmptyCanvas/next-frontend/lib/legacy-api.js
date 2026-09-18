import { cookies, headers } from "next/headers";
import { performance } from "node:perf_hooks";
import { recordPerformanceSample } from "./performance-profiler";

const ACCOUNT_BRIDGE_CACHE_TTL_MS = 15_000;
const ACCOUNT_BRIDGE_CACHE_MAX_ENTRIES = 250;
const _accountBridgeCache = new Map();
const _accountBridgeInflight = new Map();

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function legacyMetricName(url) {
  const pathname = String(url?.pathname || "/");
  if (pathname === "/api/page-bootstrap") {
    const scope = String(url?.searchParams?.get?.("scope") || "unknown").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    return `/api/page-bootstrap:${scope || "unknown"}`;
  }
  return pathname
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return ":id";
      if (/^[A-Za-z0-9_-]{28,}$/.test(segment)) return ":id";
      return segment;
    })
    .join("/");
}

function accountBridgeCacheKey(url, cookieValue) {
  if (url.pathname !== "/api/account" || url.search) return "";
  const session = String(cookieValue || "").trim();
  return session ? `${url.origin}|${session}` : "";
}

function accountBridgeCacheGet(key) {
  if (!key) return null;
  const entry = _accountBridgeCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    _accountBridgeCache.delete(key);
    return null;
  }
  return entry.value;
}

function accountBridgeCacheSet(key, value) {
  if (!key || !value?.ok || Number(value?.status) !== 200) return;
  if (_accountBridgeCache.size >= ACCOUNT_BRIDGE_CACHE_MAX_ENTRIES) {
    const firstKey = _accountBridgeCache.keys().next().value;
    if (firstKey) _accountBridgeCache.delete(firstKey);
  }
  _accountBridgeCache.set(key, {
    value,
    expiresAt: Date.now() + ACCOUNT_BRIDGE_CACHE_TTL_MS,
  });
}

function retryableGetStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
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
  const metricName = legacyMetricName(url);
  // timeoutMs is a total request budget. Previously it was applied once per
  // retry, so a 15 s request could block navigation for roughly 45 s.
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 8000) || 8000);
  const hasBody = typeof options.body !== "undefined" && options.body !== null;
  const body = hasBody && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body;
  const method = String(options.method || "GET").toUpperCase();
  const requestedAttempts = Number(options.maxAttempts);
  const maxAttempts = method === "GET"
    ? Math.max(1, Math.min(2, Number.isFinite(requestedAttempts) ? Math.round(requestedAttempts) : 2))
    : 1;
  const cookieValue = cookieHeader(cookieStore);
  const cacheKey = method === "GET" && !hasBody ? accountBridgeCacheKey(url, cookieValue) : "";

  if (cacheKey && options.fresh !== true) {
    const cached = accountBridgeCacheGet(cacheKey);
    if (cached) {
      recordPerformanceSample({
        category: "legacy-api",
        name: metricName,
        durationMs: 0,
        ok: true,
        status: cached.status || 200,
        meta: { cache: "hit", method },
      });
      return cached;
    }
    if (_accountBridgeInflight.has(cacheKey)) {
      const startedAt = performance.now();
      const shared = await _accountBridgeInflight.get(cacheKey);
      recordPerformanceSample({
        category: "legacy-api",
        name: metricName,
        durationMs: performance.now() - startedAt,
        ok: shared?.ok !== false,
        status: shared?.status || 0,
        meta: { cache: "inflight", method },
      });
      return shared;
    }
  }

  const run = async () => {
    const metricStartedAt = performance.now();
    let metricStatus = 0;
    let metricOk = false;
    let metricAttempts = 0;
    let lastError = "Legacy API is unavailable.";
    const startedAt = Date.now();

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        metricAttempts = attempt;
        const elapsed = Date.now() - startedAt;
        const remainingMs = timeoutMs - elapsed;
        if (remainingMs <= 0) {
          lastError = `Legacy API timed out after ${timeoutMs}ms.`;
          break;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), remainingMs);

        try {
          const response = await fetch(url, {
            method,
            cache: "no-store",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              accept: "application/json",
              cookie: cookieValue,
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

          metricStatus = response.status;
          if (method === "GET" && attempt < maxAttempts && retryableGetStatus(response.status)) {
            const budgetLeft = timeoutMs - (Date.now() - startedAt);
            if (budgetLeft > 180) {
              await wait(Math.min(120, Math.max(0, budgetLeft - 50)));
              continue;
            }
          }

          metricOk = response.ok;
          return {
            ok: response.ok,
            status: response.status,
            data,
            location: response.headers.get("location") || "",
          };
        } catch (error) {
          lastError = error?.name === "AbortError"
            ? `Legacy API timed out after ${timeoutMs}ms.`
            : (error?.message || "Legacy API is unavailable.");
          if (error?.name === "AbortError") metricStatus = 504;
          if (method !== "GET" || attempt >= maxAttempts) break;
          const budgetLeft = timeoutMs - (Date.now() - startedAt);
          if (budgetLeft <= 180) break;
          await wait(Math.min(120, Math.max(0, budgetLeft - 50)));
        } finally {
          clearTimeout(timeout);
        }
      }

      metricStatus = metricStatus || 503;
      return {
        ok: false,
        status: 503,
        data: null,
        location: "",
        error: lastError,
      };
    } finally {
      recordPerformanceSample({
        category: "legacy-api",
        name: metricName,
        durationMs: performance.now() - metricStartedAt,
        ok: metricOk,
        status: metricStatus,
        meta: { attempts: metricAttempts || 1, method, cache: "miss" },
      });
    }
  };

  if (!cacheKey || options.fresh === true) return await run();

  const pending = run();
  _accountBridgeInflight.set(cacheKey, pending);
  try {
    const result = await pending;
    accountBridgeCacheSet(cacheKey, result);
    return result;
  } finally {
    _accountBridgeInflight.delete(cacheKey);
  }
}
