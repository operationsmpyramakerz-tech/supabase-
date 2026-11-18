import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const panels = [
  ['Events', 'components/events/EventsSidebarFlyout.jsx'],
  ['Tasks', 'components/task-management/TaskManagementSidebarFlyout.jsx'],
  ['Shopping Cart', 'components/orders/ShoppingCartSidebarFlyout.jsx'],
];

for (const [name, path] of panels) {
  test(`${name} auto-fits the secondary rail to permission-filtered pages`, () => {
    const source = read(path);
    assert.match(source, /const pages = (?:operations\s*\? \(featureAllowed\(account, "orders\.operations\.view"\) \? OPERATIONS_ORDER_PAGES : \[\]\)\s*:\s*allowedShoppingPages\(allowedPages\)|allowedShoppingPages\(allowedPages\)|featureAllowed\(account, "tasks\.view"\) \? allowedTaskPages\(allowedPages\) : \[\]|allowedEventPages\(allowedPages\)\.filter\(page => featureAllowed\(account, modules\[page\.key\]\)\))/);
    const positionOfCount = source.indexOf('panel.style.setProperty("--secondary-page-count", String(pages.length))');
    const positionOfRender = source.indexOf('const renderPanel = () =>');
    assert.ok(positionOfCount > source.indexOf('const pages ='), 'Count comes from the filtered page list');
    assert.ok(positionOfCount < positionOfRender, 'Count is set before first render');
    assert.match(source, /\$\{pages\.map\(\(page\) =>/);
    assert.match(source, /if \(pages\.length === 1\) \{/);
    assert.match(source, /parentLi\.style\.display = pages\.length \? "" : "none"/);
  });
}

test('Mobile rail gets exactly the visible number of equal columns without a hardcoded slot', () => {
  const styles = read('public/css/unified-white-workspace.css');
  assert.match(styles, /@media \(max-width: 768px\)\s*\{\s*html\[data-theme\] body \.task-management-secondary-sidebar \.task-management-secondary-sidebar__rail\s*\{\s*grid-template-columns: repeat\(var\(--secondary-page-count, 3\), minmax\(0, 1fr\)\) !important;/);
  assert.doesNotMatch(styles.slice(styles.indexOf('/* v419 — Secondary sidebar auto-fit')), /grid-template-columns:\s*repeat\([34],/);
});

test('Updated stylesheet URL forces new mobile layout to load after deployment', () => {
  const shell = read('components/AppShell.jsx');
  assert.match(shell, /unified-white-workspace\.css\?v=sidebar-autofit-v419/);
  assert.equal((shell.match(/sidebar-autofit-v419/g) || []).length, 2);
});
