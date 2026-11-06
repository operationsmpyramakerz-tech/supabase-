import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const shell = read('components/AppShell.jsx');
const css = read('public/css/erp-global-title-chevron.css');
const cart = read('components/orders/ShoppingCartClient.jsx');
const preparing = read('components/preparing/PreparingClient.jsx');

test('shared AppShell renders one accessible active page chevron with title and icon', () => {
  assert.match(shell, /function PageTitleChevron\(\{ title, activePath \}\)/);
  assert.match(shell, /<span className="erp-title-chevron" title=\{title\}>/);
  assert.match(shell, /<span className="erp-title-chevron-icon"><ClassicIcon name=\{icon\} \/><\/span>/);
  assert.match(shell, /<span className="erp-title-chevron-label">\{title\}<\/span>/);
  assert.match(shell, /<div className="dash-title"><PageTitleChevron title=\{title\} activePath=\{activePath\} \/><\/div>/);
});

test('new stylesheet is included in both AppShell paths after the frame styles', () => {
  const link = '/next/css/erp-global-title-chevron.css?v=v332-folder-paths';
  assert.equal(shell.split(link).length - 1, 2);
  for (const segment of shell.split('erp-inner-frame.css').slice(1)) {
    assert.match(segment.slice(0, 250), /erp-global-title-chevron\.css/);
  }
});

test('current page uses the orange arrow shape and retains the vertical orange separator', () => {
  assert.match(css, /\.erp-title-chevron\s*\{/);
  assert.match(css, /background:\s*#f97316/);
  assert.match(css, /clip-path:\s*polygon/);
  assert.match(css, /\.dash-title::before\s*\{[\s\S]*?background:\s*#ea580c\s*!important/);
});

test('multi-level Projects Preparing path remains functional without duplicate title', () => {
  assert.match(preparing, /pr-header-path--chevrons/);
  assert.match(css, /\.dash-title:has\(> \.pr-header-path--chevrons\) > \.erp-title-chevron\s*\{\s*display:\s*none !important/);
  assert.match(css, /\.dash-title:has\(> \.pr-header-path--chevrons\)::before\s*\{[\s\S]*?display:\s*block !important/);
});

test('shopping cart edits only the label, leaving its chevron and icon mounted', () => {
  assert.match(cart, /const titleLabel = titleEl\?\.querySelector\("\.erp-title-chevron-label"\)/);
  assert.match(cart, /if \(titleLabel\) titleLabel\.textContent/);
  assert.doesNotMatch(cart, /titleEl\.textContent\s*=/);
});

test('desktop, mobile and dark-mode chevrons are supported without touching sidebar', () => {
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.doesNotMatch(css, /\.sidebar-nav|\.nav-link/);
});
