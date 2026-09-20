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

async function getLegacyAccountGateInternal(requiredPages = [], onSource = () => {}, options = {}) {
  // First try the lightweight Next -> Upstash session -> Supabase permission
  // path. If this deployment/session is not eligible, keep the established
  // Legacy Express account endpoint as a compatibility fallback.
  const direct = await getDirectSessionAccountGate(requiredPages, options).catch(() => null);
  if (direct) {
    onSource("direct");
    return direct;
  }

  // If Next cannot read the Redis session store directly, reuse the existing
  // authenticated Express heartbeat as a tiny session bridge. It returns the
  // member id + cached account snapshot only; authorization still happens in
  // Next against fresh Supabase page-access rows when a protected page is
  // requested. This avoids the expensive /api/account compatibility call on
  // every Vercel instance that does not have Redis credentials.
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

