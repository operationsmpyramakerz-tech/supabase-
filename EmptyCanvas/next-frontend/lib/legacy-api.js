import { performance } from "node:perf_hooks";
import { recordPerformanceSample } from "./performance-profiler";
import { fetchDirectPageBootstrap } from "./page-bootstrap-direct";

function metricNameFor(pathname = "") {
  try {
    const url = new URL(String(pathname || "/"), "http://next.local");
    if (url.pathname === "/api/page-bootstrap") {
      const scope = String(url.searchParams.get("scope") || "unknown")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-");
      return `/api/page-bootstrap:${scope || "unknown"}`;
    }
    return url.pathname || "/";
  } catch {
    return "/";
  }
}

/**
 * Compatibility adapter retained only so older Server Components do not need a
 * risky route/file rename during the final migration cleanup.
 *
 * Phase 46 deliberately removes every network fallback to the Express backend.
 * page-bootstrap is resolved locally from Supabase/Next helpers. Any other
 * former legacy path is retired and returns 410 immediately.
 */
export async function fetchLegacyJson(pathname, options = {}) {
  const startedAt = performance.now();
  const requestedPath = String(pathname || "/");
  let url = null;
  try { url = new URL(requestedPath, "http://next.local"); } catch {}

  let result;
  if (String(url?.pathname || "") === "/api/page-bootstrap") {
    result = await fetchDirectPageBootstrap(requestedPath);
  } else {
    result = {
      ok: false,
      status: 410,
      data: {
        ok: false,
        code: "LEGACY_API_RETIRED",
        error: "The legacy API fallback has been retired. This request must use the direct Next.js/Supabase path.",
      },
      location: "",
      error: "The legacy API fallback has been retired.",
    };
  }

  recordPerformanceSample({
    category: String(options.metricCategory || "direct-compatibility"),
    name: metricNameFor(requestedPath),
    durationMs: performance.now() - startedAt,
    ok: result?.ok !== false,
    status: Number(result?.status) || 0,
    meta: {
      source: String(url?.pathname || "") === "/api/page-bootstrap" ? "next-direct" : "legacy-retired",
      networkFallback: false,
    },
  });

  return result;
}
