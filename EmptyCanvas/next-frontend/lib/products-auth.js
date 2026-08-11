import "server-only";
import { fetchLegacyJson } from "./legacy-api";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export async function getLegacyAccountGate(requiredPages = []) {
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
      };
    }
  }

  return { ok: true, status: 200, error: "", account: response.data };
}
