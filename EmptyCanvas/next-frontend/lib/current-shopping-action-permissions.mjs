import { featureAllowed } from "./feature-permissions-registry.js";

// Password-free actions require an explicitly saved Advanced grant. A legacy
// page level, an absent profile or a missing grant never authorizes a write.
export function orderActionAllowed(account, key) {
  const state = account?.featureAccess;
  return state?.mode === "enforced"
    && state.grants?.[key]?.allowed === true
    && featureAllowed(account, key, { legacyAllowed: false });
}

export function orderActionGate(gate, key) {
  if (!gate?.ok) return gate;
  if (orderActionAllowed(gate.account, key)) return gate;
  return { ...gate, ok: false, status: 403, error: `Permission ${key} is not allowed.` };
}
