import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const client = read("components/users-center/UsersCenterClient.jsx");
const css = read("public/css/users-center-directory-v339.css");
const page = read("app/users-center/page.jsx");

test("Add Member is the first grid card, with the same width as users, not a toolbar action", () => {
  assert.match(client, /function AddMemberCard\(\{ onClick \}\)/);
  assert.match(client, /className="ua-add-member-card" onClick=\{onClick\}/);
  assert.match(client, /<strong>Add Member<\/strong>/);
  assert.match(client, /Create a new user account/);
  assert.match(client, /<div className="ua-directory-users__grid">\s*\{access\.memberCreate[^\n]+<AddMemberCard[^\n]+\s*\{visibleUsers\.map/);
  assert.doesNotMatch(client, /isMemberDirectoryTab \? \(access\.memberCreate \? <button/);
});

test("Department member list also shows the add card first and removes the duplicate top button", () => {
  assert.match(client, /<div className="ua-members-grid">\s*\{access\.memberCreate && !selectionMode \? <AddMemberCard/);
  assert.match(client, /Create a new account in \$\{selectedDepartment\.name\}/);
  assert.doesNotMatch(client, /className="ua-add-member-btn"/);
});

test("Creation still requires member_create and existing password confirmation; bulk selection stays clean", () => {
  assert.match(client, /access\.memberCreate && directoryTab !== "archived" && !selectionMode/);
  assert.match(client, /access\.memberCreate && !selectionMode/);
  assert.match(client, /protectedOpen\(\{ title: "Add team member", message: "Create a new user account\?" \}, \(\) => openMember\("create"\)\)/);
  assert.match(client, /function protectedOpen\(descriptor, opener\) \{ return protect/);
  assert.match(client, /memberCreate: can\("member_create"\)/);
  assert.match(client, /<AddDepartmentFolder onClick=\{openDepartmentCreate\}/);
});

test("Flat card has white/dark mode support, accessible focus, compact mobile and CSS refresh", () => {
  assert.match(css, /v343 — Shopping-Cart-inspired/);
  assert.match(css, /\.ua-add-member-card \{/);
  assert.match(css, /border: 1px dashed #c5ccd7/);
  assert.match(css, /\.ua-add-member-card:focus-visible/);
  assert.match(css, /html\[data-theme="dark"\] body\.user-access-page \.ua-directory-v339 \.ua-add-member-card/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(page, /users-center-directory-v339\.css\?v=343/);
});

test("Updated Users Center JSX parses", () => {
  const path = "components/users-center/UsersCenterClient.jsx";
  const parsed = ts.createSourceFile(path, client, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics.map((item) => item.messageText), []);
});
