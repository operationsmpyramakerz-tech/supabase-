import "server-only";

import { getDirectAccountGate } from "./products-auth";
import { loadMemberFeatureAccess } from "./feature-permissions-server";
import { featureAllowed } from "./feature-permissions-registry";

export async function notificationActionGate(key) {
  const gate = await getDirectAccountGate([], { authOnly: true });
  if (!gate.ok || !gate.memberId) return { ...gate, ok: false, status: gate.status || 401 };
  // Auth-only session snapshots do not include up-to-date grants. Always load
  // from the verified member ID; missing Supabase auth context must fail closed.
  try {
    const featureAccess = await loadMemberFeatureAccess(gate.memberId);
    if (!featureAllowed({ featureAccess }, key)) {
      return { ...gate, ok: false, status: 403, error: `Permission ${key} is not allowed.` };
    }
    return gate;
  } catch (error) {
    return { ...gate, ok: false, status: Number(error?.status) || 503, error: "Notification permission check is unavailable." };
  }
}
