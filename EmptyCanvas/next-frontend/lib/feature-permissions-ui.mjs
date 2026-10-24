// User Center display-only helpers. These never authorize access; the backend
// remains the sole source of permission enforcement.
const VALID_SCOPES = new Set(['own', 'team', 'all']);

function scope(value) { return VALID_SCOPES.has(value) ? value : 'all'; }

export function permissionDraft({ active, modules = [], definitions = [], enabledModules = {}, grants = {}, grantScopes = {}, scopedOrders = {} }) {
  return {
    active: active === true,
    modules: Object.fromEntries(modules.map(item => [item.key, enabledModules[item.key] === true])),
    grants: Object.fromEntries(definitions.map(item => [item.key, grants[item.key] === true])),
    scopes: Object.fromEntries(definitions.map(item => [item.key, scope(grantScopes[item.key])])),
    rowScopes: Object.fromEntries(Object.keys(scopedOrders).sort().map(key => [key, scopedOrders[key] === true])),
  };
}

export function modulePermissionStatus(moduleKey, draft, definitions = []) {
  const items = definitions.filter(item => item.module === moduleKey);
  const selected = items.filter(item => draft.grants[item.key] === true).length;
  const enabled = draft.active && draft.modules[moduleKey] === true;
  const hasView = items.some(item => item.key === `${moduleKey}.view`);
  const blocked = enabled && hasView && draft.grants[`${moduleKey}.view`] !== true;
  return { mode: !enabled ? 'legacy' : blocked ? 'blocked' : 'advanced', selected, total: items.length, effective: enabled && !blocked ? selected : 0 };
}

// A deterministic and intentionally small review of what will change. Hidden
// (filtered-out) modules still participate in the review before Save.
export function permissionDraftChanges(before, after, modules = [], definitions = []) {
  if (!before || !after) return [];
  const changes = [];
  if (before.active !== after.active) changes.push({ type: 'profile', label: `Profile: ${after.active ? 'Advanced enabled' : 'Legacy enabled'}` });
  for (const item of modules) {
    if (before.modules[item.key] !== after.modules[item.key]) changes.push({ type: 'module', module: item.key, label: `${item.label}: ${after.modules[item.key] ? 'Advanced' : 'Legacy'}` });
  }
  for (const item of definitions) {
    if (before.grants[item.key] !== after.grants[item.key]) changes.push({ type: 'grant', module: item.module, key: item.key, label: `${item.label}: ${after.grants[item.key] ? 'Allow' : 'Deny'}` });
    // Only granted permissions have a meaningful scope; don't report changes
    // in dormant scope values left behind by past admin edits.
    if (after.grants[item.key] && before.scopes[item.key] !== after.scopes[item.key]) changes.push({ type: 'scope', module: item.module, key: item.key, label: `${item.label}: scope ${after.scopes[item.key]}` });
  }
  for (const key of new Set([...Object.keys(before.rowScopes), ...Object.keys(after.rowScopes)])) {
    if (before.rowScopes[key] !== after.rowScopes[key]) changes.push({ type: 'row-scope', module: key, label: `${key}: row-level scope ${after.rowScopes[key] ? 'ON' : 'OFF'}` });
  }
  return changes;
}
