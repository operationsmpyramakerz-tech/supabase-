import { isTrustedLegacyAdmin } from "./admin-identity-policy.mjs";

// Used only for a destructive diagnostics operation. Advanced grants require
// explicit permissions; legacy name-based view access is not enough.
export function canClearPerformanceTelemetry(account, featureAllowed) {
  if (!account || typeof featureAllowed !== "function") return false;
  if (isTrustedLegacyAdmin(account)) return true;
  return featureAllowed(account, "backup.delete_all", { legacyAllowed: false })
    || featureAllowed(account, "users.feature_access_manage", { legacyAllowed: false });
}
