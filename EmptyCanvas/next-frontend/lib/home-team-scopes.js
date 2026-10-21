import "server-only";

import { select } from "./supabase-rest";
import { accountMemberId, homeAnalysisScope, homeSelection } from "./home-analysis-permissions";

const TABLE = "erp_member_scope_team_links";

// Deliberately do not infer managerial visibility from a shared department,
// title or reviewer/S.V. Schools access: none is a verified reporting chain.
export async function loadHomeTeamIds(account = {}) {
  if (homeAnalysisScope(account) !== "team") return [];
  const memberId = accountMemberId(account);
  if (!memberId) {
    const error = new Error("Member identity is unavailable for scoped analysis.");
    error.status = 503;
    throw error;
  }
  // A missing migration or unavailable service-role client must fail closed.
  const rows = await select(TABLE, {
    select: "visible_member_id",
    manager_member_id: `eq.${memberId}`,
    limit: "5000",
  }, { profileName: "home.team-scope" });
  if (!Array.isArray(rows)) {
    const error = new Error("Team access could not be verified.");
    error.status = 503;
    throw error;
  }
  return [...new Set(rows.map((row) => String(row?.visible_member_id || "").trim()).filter((id) => id && id !== memberId))];
}

export async function resolveHomeSelection(account = {}, requested = "all") {
  const scope = homeAnalysisScope(account);
  if (scope !== "team") return homeSelection(account, requested);
  try {
    const teamIds = await loadHomeTeamIds(account);
    return homeSelection(account, requested, { teamIds });
  } catch {
    // Never downgrade a Team-scope grant to All or a legacy fallback.
    return { allowed: false, status: 503, reason: "Home team scope is unavailable." };
  }
}

export async function scopeHomeUsers(account = {}, users = []) {
  const scope = homeAnalysisScope(account);
  if (scope === "all") return users;
  if (scope === "none") return [];
  const self = accountMemberId(account);
  const ids = new Set([self, ...(scope === "team" ? await loadHomeTeamIds(account) : [])]);
  return (Array.isArray(users) ? users : []).filter((user) => ids.has(String(user?.id || "").trim()));
}
