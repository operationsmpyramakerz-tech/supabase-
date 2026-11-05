import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../components/AppShell.jsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../public/css/erp-inner-frame.css', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../public/css/classic-parity.css', import.meta.url), 'utf8');

test('persistent and non-persistent shells both load the new frame after scrollbar styles', () => {
  const links = [...shell.matchAll(/<link rel="stylesheet" href="\/next\/css\/erp-inner-frame\.css\?v=v329-white-frame-dark-divider" precedence="erp-inner-frame" \/>/g)];
  assert.equal(links.length, 2);
  for (const line of shell.split('\n').filter(s => s.includes('erp-inner-frame.css'))) {
    assert.match(line, /erp-inner-frame/);
  }
  assert.ok(shell.indexOf('scrollbar-hidden.css') < shell.indexOf('erp-inner-frame.css'));
  assert.match(shell, /if \(persistentShell\?\.persistent\)[\s\S]*?erp-inner-frame\.css/);
  assert.equal(shell.split('\n').filter(line => line.includes('erp-inner-frame.css') && line.includes('precedence="erp-inner-frame"')).length, 2);
});

test('frame is inside authenticated light desktop shell and never paints the mobile dock', () => {
  assert.match(style, /@media \(min-width: 769px\)/);
  assert.match(style, /html\[data-theme="light"\] body\.next-classic-shell-active/);
  assert.match(style, /background: #0b0c10 !important/);
  assert.match(style, /background: #fff !important/);
  assert.match(style, /\.classic-app-shell:not\(\[class\*="-loading"\]\)/);
  assert.doesNotMatch(style, /\.nav-link|\.active-indicator|\.sidebar-header|\.sidebar-footer/);
});

test('scrollbar is invisible but wheel and touch scrolling remain enabled', () => {
  assert.match(style, /scrollbar-width: none !important/);
  assert.match(style, /::-webkit-scrollbar/);
  assert.doesNotMatch(style, /overflow-y:\s*(hidden|clip)/);
  assert.match(sidebar, /sidebar-nav\s*\{[\s\S]*?overflow-y: auto/);
});


test('dark theme has a white shell frame around its original dark content', () => {
  assert.match(style, /html\[data-theme="dark"\] body\.next-classic-shell-active/);
  assert.match(style, /background: #ffffff !important/);
  assert.match(style, /background: #000000 !important/);
  assert.match(style, /border-radius: 40px !important/);
  assert.match(style, /border-radius: 32px !important/);
  assert.match(style, /\.sidebar-workspace-boundary::after/);
  assert.match(style, /background: rgba\(15, 23, 42, \.30\) !important/);
  assert.doesNotMatch(style, /\.nav-link|\.active-indicator|\.sidebar-header|\.sidebar-footer/);
});
