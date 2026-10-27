// Keep permission snapshots JSON/React Server Component serializable.
// Objects with a null prototype cannot be passed to Client Components.
export function buildSerializableFeatureGrants(rows, isKnownFeature) {
  const grants = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.permission_key || "");
    if (!isKnownFeature(key)) continue;
    grants[key] = {
      allowed: row.is_allowed === true,
      scope: String(row.data_scope || "").trim() || "all",
    };
  }
  return grants;
}
