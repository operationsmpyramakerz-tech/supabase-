import "server-only";
import { performance } from "node:perf_hooks";
import { fetchLegacyJson } from "./legacy-api";
import { getDirectAccountGateFromSessionContext, getDirectSessionAccountGate } from "./direct-session-account";
import { recordPerformanceSample } from "./performance-profiler";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function accountMemberId(account = {}) {
  return String(
    account?.teamMemberId
    || account?.userSupabaseId
    || account?.userId
    || account?.id
    || "",
  ).trim();
}

async function getDirectOrBridgedAccountGateInternal(requiredPages = [], onSource = () => {}, options = {}) {
  // Preferred path: Next reads the signed Express session from the same
  // Redis/Upstash store, then rebuilds the account + permission matrix from
  // Supabase. Authorization is therefore decided entirely in Next.
  const direct = await getDirectSessionAccountGate(requiredPages, options).catch(() => null);
  if (direct) {
    onSource("direct");
    return direct;
  }

  // Compatibility bridge while the root Express deployment still owns the
  // session cookie. This endpoint supplies authenticated session identity only;
  // page permissions are rebuilt and checked by Next against fresh Supabase
  // rows through getDirectAccountGateFromSessionContext.
  const sessionStatus = await fetchLegacyJson("/api/session-status", {
    timeoutMs: 3_000,
    maxAttempts: 1,
    metricCategory: "session-bridge",
  }).catch(() => null);

  if (sessionStatus?.status === 401) {
    onSource("session-bridge");
    return { ok: false, status: 401, error: "Authentication required.", account: null };
  }
  if (sessionStatus?.ok && sessionStatus.data) {
    const bridged = await getDirectAccountGateFromSessionContext(
      sessionStatus.data,
      requiredPages,
      options,
    ).catch(() => null);
    if (bridged) {
      onSource("session-bridge");
      return bridged;
    }
  }

  return null;
}

async function getLegacyAccountGateInternal(requiredPages = [], onSource = () => {}, options = {}) {
  const direct = await getDirectOrBridgedAccountGateInternal(requiredPages, onSource, options);
  if (direct) return direct;

  // General compatibility path for modules that have not completed the Next
  // authorization cutover yet. Orders mutation routes no longer use this path.
  onSource("legacy");
  const response = await fetchLegacyJson("/api/account", { timeoutMs: 15000 });

  if (response.status === 401) {
    return { ok: false, status: 401, error: "Authentication required.", account: null };
  }
  if (!response.ok || !response.data) {
    return {
      ok: false,
      status: response.status || 503,
      error: response.error || response.data?.error || "The authentication service is unavailable.",
      account: null,
    };
  }

  const pages = Array.isArray(requiredPages) ? requiredPages : [requiredPages];
  const wanted = pages.map(normalize).filter(Boolean);
  if (wanted.length) {
    const allowed = new Set((response.data.allowedPages || []).map(normalize).filter(Boolean));
    const hasAccess = wanted.some((page) => allowed.has(page));
    if (!hasAccess) {
      return {
        ok: false,
        status: 403,
        error: `${pages.join(" or ")} access is not allowed for this account.`,
        account: response.data,
        memberId: accountMemberId(response.data),
      };
    }
  }

  return { ok: true, status: 200, error: "", account: response.data, memberId: accountMemberId(response.data) };
}

export async function getDirectAccountGate(requiredPages = [], options = {}) {
  const startedAt = performance.now();
  let source = "direct";
  let result = null;
  let thrown = null;
  try {
    result = await getDirectOrBridgedAccountGateInternal(requiredPages, (value) => { source = value || source; }, options);
    if (result) return result;
    result = {
      ok: false,
      status: 503,
      error: "The direct authentication context is unavailable. Please sign in again or retry shortly.",
      account: null,
    };
    return result;
  } catch (error) {
    thrown = error;
    throw error;
  } finally {
    recordPerformanceSample({
      category: "auth",
      name: options?.authOnly === true ? "account-gate-direct-auth-only" : "account-gate-direct",
      durationMs: performance.now() - startedAt,
      ok: thrown ? false : Boolean(result?.ok) || [401, 403].includes(Number(result?.status)),
      status: Number(result?.status) || (thrown ? Number(thrown?.status) || 500 : (result ? 0 : 503)),
      meta: {
        source,
        requiredPages: Array.isArray(requiredPages) ? requiredPages.length : (requiredPages ? 1 : 0),
        authOnly: options?.authOnly === true,
      },
    });
  }
}

export async function getLegacyAccountGate(requiredPages = [], options = {}) {
  const startedAt = performance.now();
  let source = "direct";
  let result = null;
  let thrown = null;
  try {
    result = await getLegacyAccountGateInternal(requiredPages, (value) => { source = value || source; }, options);
    return result;
  } catch (error) {
    thrown = error;
    throw error;
  } finally {
    recordPerformanceSample({
      category: "auth",
      name: options?.authOnly === true ? "account-gate-auth-only" : "account-gate",
      durationMs: performance.now() - startedAt,
      ok: thrown ? false : Boolean(result?.ok) || [401, 403].includes(Number(result?.status)),
      status: Number(result?.status) || (thrown ? Number(thrown?.status) || 500 : 0),
      meta: {
        source,
        requiredPages: Array.isArray(requiredPages) ? requiredPages.length : (requiredPages ? 1 : 0),
        authOnly: options?.authOnly === true,
      },
    });
  }
}
