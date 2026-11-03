import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

const maintenanceUI = read('components/orders/MaintenanceHeavyModals.jsx');
const sharedUI = read('components/orders/MaintenanceComponentCards.jsx');
const myUI = read('components/orders/CurrentOrdersHeavyModals.jsx');
const operationsUI = read('components/orders/OperationsOrdersHeavyModals.jsx');
const myData = read('lib/current-orders-data.js');
const operationsData = read('lib/operations-orders-data.js');
const maintenanceData = read('lib/maintenance-orders-data.js');
const shell = read('components/PersistentAppShell.jsx');
const css = read('public/css/maintenance-orders.css');

test('all three maintenance detail views use one shared log/component renderer', () => {
  assert.match(sharedUI, /export function MaintenanceComponentCards\(/);
  assert.match(maintenanceUI, /<MaintenanceComponentCards items=\{group\.items\}/);
  assert.match(myUI, /maintenance \? <div className="next-maintenance-parity[^"]*">\s*<MaintenanceComponentCards items=\{tabItems\}/);
  assert.match(operationsUI, /maintenance && !isEditing \? <div className="next-maintenance-parity[^"]*">\s*<MaintenanceComponentCards items=\{tabItems\}/);
  // Maintenance shipping/received rows typically have zero stock receiving Qty.
  assert.match(myUI, /maintenance \? group\.items : itemsForCurrentTab\(group\.items, tab\)/);
  assert.match(operationsUI, /maintenance \? group\.items : itemsForOperationsTab\(group\.items, tab\)/);
  for (const label of ['Log One', 'Log Two', 'Machine details', 'Serial number', 'Initial issue', 'Maintenance action', 'Resolution method', 'Maintenance checklist', 'Actual issue description', 'Repair action', 'Spare parts needed', 'Spare parts replaced', 'Technician name']) {
    assert.ok(sharedUI.includes(label), `Shared maintenance renderer should include ${label}`);
  }
});

test('maintenance-specific CSS is scoped to the embedded UI and loaded on order routes', () => {
  assert.match(shell, /maintenance-orders\.css\?v=maintenance-shared-details-v306/);
  assert.match(css, /body\.current-orders-page \.next-maintenance-parity/);
  assert.match(css, /body\.operations-orders-page \.next-maintenance-parity/);
  assert.match(css, /body\.page-maintenance-orders \.next-classic-maintenance-parity/);
  assert.match(css, /next-maintenance-log-frame--two/);
});

test('detail-only maintenance product enrichment preserves existing page scope checks', () => {
  assert.match(myData, /visibleOrderRow\(row, resolved\)/);
  assert.match(myData, /const enrichedMaintenance = maintenanceDetails\.length \? await enrichMaintenanceDetailProducts/);
  assert.match(operationsData, /return await enrichOperationsMaintenanceRows\(details, timings\);/);
  assert.match(maintenanceData, /import \{ enrichMaintenanceDetailProducts \} from "\.\/maintenance-detail-enrichment"/);
  const enrichment = read('lib/maintenance-detail-enrichment.js');
  assert.match(enrichment, /maintenanceLogs/);
  assert.match(enrichment, /sparePartsNeededEntries/);
  assert.match(enrichment, /sparePartsReplacedEntries/);
  assert.match(enrichment, /unitPrice/);
});

test('My Orders continues using its scoped exporter and downloads maintenance reports as PDFs', () => {
  const current = read('components/orders/CurrentOrdersClient.jsx');
  assert.match(current, /kind === "pdf" && isMaintenanceOrder\(group\.orderType\) \? "maintenance-pdf" : kind/);
  assert.match(current, /scope: "current",\s*kind: exportKind/);
  assert.match(operationsUI, /onAction\("maintenance-log", group\)/);
});
