import "server-only";
import { performance } from "node:perf_hooks";
import { getDirectSessionAccountGate } from "./direct-session-account";
import { recordPerformanceSample } from "./performance-profiler";

async function getDirectAccountGateInternal(requiredPages = [], onSource = () => {}, options = {}) {
  const direct = await getDirectSessionAccountGate(requiredPages, options).catch(() => null);
  if (direct) {
    onSource("direct");
    return direct;
  }
  onSource("direct-unavailable");
  return {
    ok: false,
    status: 503,
    error: "The direct authentication context is unavailable. Please sign in again or retry shortly.",
    account: null,
    memberId: "",
  };
}

export async function getDirectAccountGate(requiredPages = [], options = {}) {
  const startedAt = performance.now();
  let source = "direct";
  let result = null;
  let thrown = null;
  try {
    result = await getDirectAccountGateInternal(requiredPages, (value) => { source = value || source; }, options);
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
    result = await getDirectAccountGateInternal(requiredPages, (value) => { source = value || source; }, options);
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
