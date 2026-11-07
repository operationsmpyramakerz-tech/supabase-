import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const ui = read('components/users-center/UsersCenterClient.jsx');
const api = read('app/api/users-center/mutations-direct/route.js');
const mutations = read('lib/users-center-mutations.js');
const email = read('lib/users-center-email.js');
const css = read('public/css/users-center-directory-v339.css');
const page = read('app/users-center/page.jsx');

test('Invite appears beside Edit on global user cards and department cards, with missing-email guard', () => {
  assert.match(ui, /ua-member-card__dual-actions/);
  assert.match(ui, /ua-directory-user-card__invite/);
  assert.match(ui, /onInvite=\{\(\) => inviteMember\(member\)\}/);
  assert.match(ui, /onClick=\{\(\) => inviteMember\(member\)\}/);
  assert.match(ui, /disabled=\{!text\(member\.email\) \|\| member\.isActive === false\}/);
  assert.match(ui, /confirmLabel: "Send Invite"/);
  assert.match(ui, /usersCenterMutation\("member-invite", \{ memberId: member\.id \}\)/);
  assert.match(ui, /protectedOpen\(\{ title: "Invite team member"/);
});
test('only admin-authorized server action may send invitations; password stays out of UI and API response', () => {
  assert.match(api, /"member-invite": "users.member_edit"/);
  assert.match(api, /verifyUsersCenterAuthorizationToken\(body\?\.authorizationToken/);
  assert.match(api, /await inviteMemberByEmail\(body\?\.memberId\)/);
  assert.match(mutations, /const row = await selectById\(teamMembersTable\(\), id\)/);
  assert.match(mutations, /const password = text\(valueForLabel\(row, "Password"\)\)/);
  assert.match(mutations, /if \(!password\) throw httpError/);
  assert.match(mutations, /Activate this user before sending an invitation/);
  assert.match(mutations, /await sendUsersCenterMemberInviteEmail\(\{ to: email, name, username, password \}\)/);
  assert.match(api, /return json\(\{ ok: true, \.\.\.result, source: "supabase-next" \}\)/);
  assert.doesNotMatch(mutations.split('export async function inviteMemberByEmail')[1].split('export async function deleteMember')[0], /return \{[^}]*password/);
});
test('invite email contains app URL, username, password with no client payload credentials', () => {
  assert.match(email, /export async function sendUsersCenterMemberInviteEmail/);
  assert.match(email, /new URL\("\/next\/login", url\.origin\)/);
  assert.match(email, /Username: \$\{text\(username\)\}/);
  assert.match(email, /Password: \$\{text\(password\)\}/);
  assert.match(email, /const resend = await sendWithResend\(email\)/);
  assert.match(email, /const smtp = await sendWithSmtp\(email\)/);
});
test('Preferences consolidates Select and Sort on both directory and department views', () => {
  assert.match(ui, /function DirectoryPreferences\(/);
  assert.match(ui, /aria-label="Preferences: select and sort"/);
  assert.match(ui, /section === "select"/);
  assert.match(ui, /section === "sort"/);
  assert.match(ui, /canSelect=\{isMemberDirectoryTab && \(access\.pageAccess \|\| access\.featureAccess\)\}/);
  assert.match(ui, /key=\{selectedDepartment\.id\}/);
  assert.match(ui, /Edit Access/);
  assert.doesNotMatch(ui, /<label className="ua-directory-sort"/);
});
test('Add Department is an inline card rather than toolbar button', () => {
  assert.match(ui, /function AddDepartmentFolder\(\{ onClick \}\)/);
  assert.match(ui, /className="ua-add-member-card ua-add-department-card"/);
  assert.match(ui, /<strong>Add Department<\/strong>/);
  assert.match(ui, /directoryTab === "departments" && !search \? <AddDepartmentFolder/);
  assert.doesNotMatch(ui, /<UAIcon name="plus"\/><span>Add Group<\/span>/);
  assert.match(css, /\.ua-folders \.ua-add-department-card/);
});
test('Menus anchor to their triggers and new controls are dark/mobile ready', () => {
  assert.match(css, /\.ua-directory-user-card \.ua-member-menu-wrap/);
  assert.match(css, /top: calc\(100% \+ 5px\) !important/);
  assert.match(css, /\.ua-directory-preferences__panel/);
  assert.match(css, /html\[data-theme="dark"\] body\.user-access-page \.ua-directory-v339 \.ua-directory-preferences__trigger/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(page, /users-center-directory-v339\.css\?v=345/);
});
test('all changed JSX and JS files parse', () => {
  for (const name of ['components/users-center/UsersCenterClient.jsx','lib/users-center-email.js','lib/users-center-mutations.js','app/api/users-center/mutations-direct/route.js','app/users-center/page.jsx']) {
    const f = ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true, name.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
    assert.deepEqual(f.parseDiagnostics.map(d => d.messageText), [], name);
  }
});
