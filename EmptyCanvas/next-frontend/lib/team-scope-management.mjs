// Pure validation shared by the admin endpoint and the regression tests.
// Team visibility is an explicit allowlist, never inferred from department.
export const MAX_TEAM_LINKS = 500;
export function safeMemberId(value) {
  const id = String(value ?? "").trim();
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : "";
}
export function normalizeTeamLinks(managerId, raw, knownIds = null) {
  const manager = safeMemberId(managerId);
  if (!manager) throw Object.assign(new Error("Invalid manager member ID."), { status: 400 });
  if (!Array.isArray(raw) || raw.length > MAX_TEAM_LINKS) {
    throw Object.assign(new Error(`Select at most ${MAX_TEAM_LINKS} team members.`), { status: 400 });
  }
  const result = [];
  const unique = new Set();
  const known = knownIds ? new Set([...knownIds].map(String)) : null;
  for (const entry of raw) {
    const id = safeMemberId(entry);
    if (!id || id === manager || (known && !known.has(id))) {
      throw Object.assign(new Error("A selected team member is invalid or unavailable."), { status: 400 });
    }
    if (!unique.has(id)) { unique.add(id); result.push(id); }
  }
  return result.sort();
}
