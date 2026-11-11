// Shared, opt-in stage-level access. Older advanced permission profiles keep
// their existing rights until an administrator enables granular stage access.
import { featureAllowed } from './feature-permissions-registry.js';
import { PREPARING_EDIT_TAB_MARKER, preparingTabKnown, preparingTabKey } from './preparing-tab-permissions.mjs';

export const PREPARING_STAGE_KEYS = Object.freeze(['intake', 'testing', 'warehouse', 'production', 'boxes', 'cartons']);
export const PREPARING_STAGE_MARKER = 'preparing.stages.__granular';

export function preparingStageAllowed(account, stage) {
  if (!PREPARING_STAGE_KEYS.includes(stage) || !featureAllowed(account, 'preparing.view')) return false;
  const granular = account?.featureAccess?.mode === 'enforced'
    && featureAllowed(account, PREPARING_STAGE_MARKER);
  if (granular) return featureAllowed(account, `preparing.stage.${stage}`);
  return featureAllowed(account, stage === 'warehouse'
    ? 'preparing.warehouse_receive' : 'preparing.stage_update');
}

// Legacy profiles retain the existing read-only stage view until the owner
// explicitly enables individual stage assignment for that user.
export function preparingStagesGranular(account) {
  return account?.featureAccess?.mode === 'enforced'
    && featureAllowed(account, PREPARING_STAGE_MARKER);
}

export function preparingStageReadable(account, stage) {
  if (!PREPARING_STAGE_KEYS.includes(stage) || !featureAllowed(account, 'preparing.view')) return false;
  return !preparingStagesGranular(account) || preparingStageAllowed(account, stage);
}

// Per-tab controls are opt-in. With them disabled, keep existing stage
// permissions untouched, including all currently deployed accounts.
export function preparingTabsGranular(account) {
  return account?.featureAccess?.mode === 'enforced' && featureAllowed(account, PREPARING_EDIT_TAB_MARKER);
}
export function preparingTabEditAllowed(account, stage, tab) {
  if (!preparingTabKnown(stage, tab) || !preparingStageAllowed(account, stage)) return false;
  return !preparingTabsGranular(account) || featureAllowed(account, preparingTabKey(stage, tab));
}

export function preparingStageReadGate(gate, stage) {
  if (!gate?.ok) return gate;
  if (preparingStageReadable(gate.account, stage)) return gate;
  return { ...gate, ok: false, status: 403, error: `Access to ${stage} stage is not allowed.` };
}

// Existing warehouse component management remains a separate permission; it
// must not silently grant access to the receiving stage when granular mode is ON.
export function preparingStageGate(gate, stage) {
  if (!gate?.ok) return gate;
  if (preparingStageAllowed(gate.account, stage)) return gate;
  return { ...gate, ok: false, status: 403, error: `Access to ${stage} stage is not allowed.` };
}
