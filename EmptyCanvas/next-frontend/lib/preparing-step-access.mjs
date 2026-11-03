// Pure permission projection for the Project Steps avatar strip.
// The steps do not have project-specific assignees: show *actual ERP users*
// allowed to update that stage, never beneficiaries or fabricated avatars.
export const PREPARING_STEP_PERMISSIONS = Object.freeze({
  components: "preparing.manage",
  testing: "preparing.stage.testing",
  warehouse: "preparing.stage.warehouse",
  production: "preparing.stage.production",
  boxes: "preparing.stage.boxes",
  cartons: "preparing.stage.cartons",
});

const canonical = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
const pageMatches = page => {
  const key = canonical(page?.page_key);
  const name = canonical(page?.page_name);
  const route = canonical(page?.route_path);
  return key === "projectspreparing" || name === "projectspreparing"
    || route.endsWith("projectspreparing");
};

export function membersWithPreparingStageAccess({ members = [], pages = [], pageAccess = [], profiles = [], grants = [], legacyPages = [], trustedAdminIds = [] } = {}) {
  const preparingPageIds = new Set(pages.filter(pageMatches).map(page => String(page.id)));
  const pageUsers = new Set(pageAccess.filter(row => row.is_enabled === true && preparingPageIds.has(String(row.page_id)))
    .map(row => String(row.team_member_id)));
  const legacyUsers = new Set(legacyPages.filter(row => String(row.allowed_pages || "").toLowerCase().includes("projects preparing") || String(row.allowed_pages || "").toLowerCase().includes("projects-preparing"))
    .map(row => String(row.id)));
  const adminUsers = new Set(trustedAdminIds.map(String));
  const migrated = new Set(profiles.filter(row => row.enabled === true).map(row => String(row.team_member_id)));
  const byMember = new Map();
  for (const row of grants) {
    const id = String(row.team_member_id);
    if (!byMember.has(id)) byMember.set(id, new Map());
    byMember.get(id).set(String(row.permission_key), row);
  }
  const list = Object.fromEntries(Object.keys(PREPARING_STEP_PERMISSIONS).map(key => [key, []]));
  for (const person of members) {
    const id = String(person.id || "");
    if (!id || !(pageUsers.has(id) || (!pageAccess.some(row => String(row.team_member_id) === id) && legacyUsers.has(id)) || adminUsers.has(id))) continue;
    const memberGrants = byMember.get(id);
    const can = permission => {
      if (!migrated.has(id)) return true; // verified legacy page access
      const view = memberGrants?.get("preparing.view");
      if (view?.is_allowed !== true || (view?.data_scope || "all") !== "all") return false;
      const granular = memberGrants?.get("preparing.stages.__granular")?.is_allowed === true;
      const effectivePermission = granular ? permission
        : permission === "preparing.stage.warehouse" ? "preparing.warehouse_receive"
        : permission.startsWith("preparing.stage.") ? "preparing.stage_update" : permission;
      const grant = memberGrants?.get(effectivePermission);
      return grant?.is_allowed === true && (grant?.data_scope || "all") === "all";
    };
    for (const [step, permission] of Object.entries(PREPARING_STEP_PERMISSIONS)) {
      if (can(permission)) list[step].push({ id, name: String(person.name || "Team member") });
    }
  }
  for (const value of Object.values(list)) value.sort((a,b) => a.name.localeCompare(b.name));
  return list;
}
