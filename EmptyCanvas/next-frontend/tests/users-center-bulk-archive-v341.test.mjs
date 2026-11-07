import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const client = file("components/users-center/UsersCenterClient.jsx");
const modal = file("components/users-center/BulkPageAccessModal.jsx");
const css = file("public/css/users-center-directory-v339.css");
const api = file("app/api/users-center/mutations-direct/route.js");
const mutations = file("lib/users-center-mutations.js");
const login = file("lib/core-auth.js");
const session = file("lib/direct-session-account.js");

test("Active/Inactive status actions retain safe underlying member-archive mutation", () => {
  assert.match(client, /Set User Inactive/);
  assert.match(client, /Set User Active/);
  assert.match(client, /member.isActive \? "Inactive" : "Active"/);
  assert.match(client, /member-archive/);
  assert.match(client, /member\.isActive \? "lock" : "unlock"/);
  assert.match(client, /onArchive=\{\(\) => setArchived\(member\)\}/);
  assert.match(mutations, /export async function setMemberArchived/);
  assert.match(mutations, /updateById\(teamMembersTable\(\), id, \{ \[statusColumn\]: !archived \}\)/);
  assert.doesNotMatch(mutations.split("export async function setMemberArchived")[1].split("export async function deleteMember")[0], /deleteById/);
});

test("archived users cannot sign in and sessions are revoked", () => {
  assert.match(login, /This account is archived/);
  assert.match(session, /AUTH_MEMBER_ARCHIVED/);
  assert.match(session, /is_active", "isActive"\]/);
  assert.match(mutations, /if \(archived\) await setDirectUserAuthRevokedAt/);
  assert.match(api, /You cannot archive your own account/);
});

test("bulk access respects feature/password authority and never writes untouched grants", () => {
  assert.match(api, /"page-access-bulk": "users.page_access_manage"/);
  assert.match(api, /"feature-access-bulk": "users.feature_access_manage"/);
  assert.match(api, /verifyUsersCenterAuthorizationToken\(body\?\.authorizationToken/);
  assert.match(mutations, /export async function bulkUpdatePageAccess/);
  assert.match(mutations, /savePageAccess\(id, operations, \{ grantedBy, suppliedRows: team \}\)/);
  assert.match(mutations, /const successes = \[\], failures = \[\]/);
  assert.match(api, /if \(!profile\.enabled\) throw new Error\("Advanced Permissions are disabled/);
  assert.match(api, /await replaceMemberFeatureAccess\(id, \[\.\.\.grants\.values\(\)\], \{ enabled: true \}\)/);
  assert.match(client, /access\.pageAccess \|\| access\.featureAccess/);
});

test("bulk dialog uses unchanged-by-default choices and confirms before write", () => {
  assert.match(modal, /value: "keep", label: "Keep unchanged"/);
  assert.match(modal, /choice === "keep"\) return null/);
  assert.match(modal, /Review before applying/);
  assert.match(modal, /Review \$\{activeChanges\.length\} Changes/);
  assert.match(modal, /\"page-access-bulk\"/);
  assert.match(modal, /\"feature-access-bulk\"/);
  assert.match(modal, /result\.failures\.map/);
});

test("member cards compact and selection controls responsive and dark-ready", () => {
  assert.match(css, /\.ua-directory-user-card \{gap:8px;padding:12px 13px/);
  assert.match(css, /\.ua-directory-bulkbar/);
  assert.match(css, /\.ua-bulk-overlay/);
  assert.match(css, /html\[data-theme="dark"\] \.ua-bulk-modal/);
  assert.match(css, /@media\(max-width:640px\)/);
});

test("all changed JSX and JS files parse", () => {
  for (const path of [
    "components/users-center/UsersCenterClient.jsx", "components/users-center/BulkPageAccessModal.jsx",
    "app/api/users-center/mutations-direct/route.js", "lib/users-center-mutations.js",
    "lib/core-auth.js", "lib/direct-session-account.js", "app/users-center/page.jsx",
  ]) {
    const ast = ts.createSourceFile(path, file(path), ts.ScriptTarget.Latest, true, path.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS);
    assert.deepEqual(ast.parseDiagnostics.map((diagnostic) => diagnostic.messageText), [], path);
  }
});
