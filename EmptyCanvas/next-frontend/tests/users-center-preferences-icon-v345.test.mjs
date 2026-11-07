import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ui = read('components/users-center/UsersCenterClient.jsx');
const css = read('public/css/users-center-directory-v339.css');
const page = read('app/users-center/page.jsx');
const email = read('lib/users-center-email.js');
test('icon-only Preferences button on all viewports, including tablet', () => {
  assert.match(ui, /aria-label="Preferences: select and sort" title="Preferences"/);
  assert.match(ui, /<UAIcon name="preferences"\/>\s*<\/button>/);
  assert.doesNotMatch(ui, /<UAIcon name="preferences"\/><span>Preferences<\/span>/);
  assert.match(css, /v345 — Users Center compact icon-only Preferences/);
  assert.match(css, /min-width: 46px;/);
  assert.match(page, /users-center-directory-v339\.css\?v=345/);
});
test('Preferences tabs, options, actions and 3-dot menus have aligned icons', () => {
  assert.match(ui, /aria-pressed=\{section === "select"\}/);
  assert.match(ui, /aria-pressed=\{section === "sort"\}/);
  assert.match(css, /\.ua-directory-preferences__tabs button > svg/);
  assert.match(css, /\.ua-directory-preferences__options button > svg/);
  assert.match(css, /\.ua-member-card__dual-actions > button > svg/);
  assert.match(css, /\.ua-member-menu button > svg/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /html\[data-theme="dark"\]/);
});
test('invitation delivery code is not changed by a template preview', () => {
  assert.match(email, /export async function sendUsersCenterMemberInviteEmail/);
  const src = ts.createSourceFile('UsersCenterClient.jsx', ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.deepEqual(src.parseDiagnostics.map(d=>d.messageText), []);
});
