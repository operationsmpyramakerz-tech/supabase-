/** Phase 9 static integration assertions (no database credentials or notifications sent).
 * Run: node scripts/test-home-sla-phase9-audit.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const migration = read('../../supabase_home_sla_phase9.sql');
const worker = read('../lib/home-sla-alert-worker.js');
const route = read('../app/api/home/sla-health/route.js');
const escalations = read('../app/api/home/sla-escalations/route.js');
const editor = read('../components/home/SlaSettingsClient.jsx');
const cron = read('../app/api/cron/notifications/route.js');
assert.match(migration, /'delivered', 'failed', 'skipped'/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.erp_sla_cycle_runs/);
assert.match(migration, /REVOKE ALL ON TABLE public\.erp_sla_cycle_runs FROM PUBLIC, anon, authenticated/);
assert.match(worker, /status: 'skipped'/);
assert.match(worker, /erp_sla_cycle_runs/);
assert.match(worker, /status: deliveryError \? 'failed' : scan\.deferred \? 'deferred' : 'ok'/);
assert.match(route, /getDirectAccountGate\(\[\]\)/);
assert.match(route, /if \(!canManageSla\(gate\.account\)\)/);
assert.doesNotMatch(route, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/);
assert.match(route, /'Cache-Control': 'private, no-store'/);
assert.match(route, /erp_sla_cycle_runs/);
assert.match(route, /Configured \(execution not verified\)/);
assert.match(escalations, /skipped: 0/);
assert.match(editor, /Skipped', health\.skipped/);
assert.match(editor, /<SlaDiagnostics \/>/);
assert.match(cron, /if \(!authorized\(request\)\)/);
console.log('Phase 9 SQL, queue-state, private diagnostics, and cron integration: all assertions passed');
