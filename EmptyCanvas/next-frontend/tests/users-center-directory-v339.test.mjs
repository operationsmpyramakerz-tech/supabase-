import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const client = readFileSync(new URL('../components/users-center/UsersCenterClient.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/users-center/page.jsx', import.meta.url), 'utf8');
const data = readFileSync(new URL('../lib/users-center-data.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/users-center-directory-v339.css', import.meta.url), 'utf8');

test('Users Center loads the directory design after original styles', () => {
  assert.match(page, /user-access\.css[^"']+"\s*,\s*"\/next\/css\/users-center-directory-v339\.css/);
  assert.match(client, /className="ua-page-body ua-directory-v339"/);
  assert.match(css, /\.ua-directory-v339 \.ua-directory-hero/);
});
test('all overview numbers are computed from actual directory, not hardcoded demo numbers', () => {
  assert.match(client, /Total Users<\/span><strong>\{directory\.total\}/);
  assert.match(client, /Groups<\/span><strong>\{directory\.departments\.length\}/);
  assert.match(client, /Sign up Requests<\/span><strong>\{pendingSignupCount\}/);
  assert.doesNotMatch(client, /<strong>\s*(?:39|37|10|7)\s*<\/strong>/);
});
test('active count is not invented and disabled when account status is unavailable', () => {
  assert.match(client, /typeof member\.isActive === "boolean"/);
  assert.match(client, /activeUsersCount === null \? "—" : activeUsersCount/);
  assert.match(client, /disabled=\{\(item\.id === "active" \|\| item\.id === "archived"\) && !statusAvailable\}/);
  assert.match(data, /\["is_active", "isActive"\]/);
  assert.match(data, /isActive: valueFor\(row, \["is_active", "isActive"\]\) == null \? null/);
});
test('department navigation, long press edit/delete, and member permissions remain wired', () => {
  assert.match(client, /onPointerDown=\{startLongPress\}/);
  assert.match(client, /onOpen=\{navigateDepartment\}/);
  assert.match(client, /department-delete/);
  assert.match(client, /member-delete/);
  assert.match(client, /onOpenPageAccess=\{\(\) => setPageAccessOpen\(true\)\}/);
  assert.match(client, /onOpenSvAccess=\{\(\) => setSvAccessOpen\(true\)\}/);
  assert.match(client, /<AddDepartmentFolder onClick=\{openDepartmentCreate\}/);
});
test('search, sort and responsive columns are present', () => {
  assert.match(client, /aria-label=\{isMemberDirectoryTab \? "Sort users" : "Sort departments"\}/);
  assert.match(client, /onChange=\{\(event\) => setSearch\(event\.target\.value\)\}/);
  assert.match(client, /visibleDepartments\.map/);
  assert.match(css, /grid-template-columns: repeat\(2,minmax\(0,1fr\)\) !important;/);
  assert.match(css, /max-width: 640px/);
  assert.match(css, /grid-template-columns:1fr !important;/);
});
