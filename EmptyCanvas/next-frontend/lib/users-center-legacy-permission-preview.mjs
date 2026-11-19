// Read-only compatibility projection for the per-page editor. Nothing here is
// persisted when the preferences window opens. Page Access remains authoritative
// for every account that has not explicitly saved detailed permissions.
import { featureModuleForPage } from './users-center-page-feature-map.mjs';

const READ_ACTION = /(?:^|\.)(?:view|view_details|details|read|export|download|pdf|report|analysis|financial_analysis|sla_view|checklist_view|preferences|tracking)(?:$|\.)/;
const NEVER_INHERIT = new Set([
  'orders.operations.delete', // New destructive capability must be explicitly granted.
  'expenses.users.edit', // Password-free expense edits require an explicit grant.
  'preparing.stages.__granular', 'preparing.tabs.__granular',
  'orders.shopping.sources.__granular',
]);

export function legacyFeaturePreview(page, featureKey) {
  if (!page?.isEnabled) return false;
  const level = String(page.accessLevel || 'edit').toLowerCase();
  const key = String(featureKey || '');
  if (NEVER_INHERIT.has(key) || key.startsWith('preparing.stage.') || key.startsWith('preparing.tab.')
    || key.startsWith('orders.shopping.source.')) return false;
  if (key.endsWith('.view') || READ_ACTION.test(key)) return true;
  // A View-only page must not acquire mutation privileges during migration.
  return level === 'edit' || level === 'admin';
}

export function legacyModulePreview(page, definitions, moduleKey) {
  return Object.fromEntries((definitions || []).filter(item => item.module === moduleKey)
    .map(item => [item.key, legacyFeaturePreview(page, item.key)]));
}

// Preparing differs from other opt-in modules: all enforced profiles need
// preparing.view. A first per-page migration of an unrelated module must not
// silently hide Preparing from a legacy user or activate granular stage rules.
export function preparingLegacyCompatibility(allPageRows, definitions) {
  const row = (allPageRows || []).find(page => featureModuleForPage(page) === 'preparing');
  return legacyModulePreview(row, definitions, 'preparing');
}
