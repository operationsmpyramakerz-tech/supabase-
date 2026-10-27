// Security policy: editable job titles must never grant system-wide Admin access.
// The built-in legacy Admin identity remains supported for compatibility.
// Additional trusted legacy administrators may be configured by immutable member ID.
const identityText = value => {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.map(identityText).join(" ");
    return identityText(value.name ?? value.value ?? value.label ?? "");
  }
  return String(value ?? "");
};
const canonical = value => identityText(value).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");

export function isReservedAdminName(value) {
  return canonical(value) === "admin";
}

export function isTrustedLegacyAdmin(account = {}, { sessionUsername = "" } = {}) {
  const id = String(account.userSupabaseId || account.teamMemberId || account.id || "").trim();
  const listedIds = String(process.env.ERP_TRUSTED_ADMIN_MEMBER_IDS || "")
    .split(",").map(item => item.trim()).filter(Boolean);
  if (id && listedIds.includes(id)) return true;
  // The original built-in Admin account is explicitly named Admin. A position
  // such as "Administrative Assistant" is never proof of authorization.
  return isReservedAdminName(account.name || account.username || sessionUsername);
}
