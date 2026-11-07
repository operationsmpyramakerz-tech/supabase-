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

test("status UI uses Active and Inactive while preserving secure archive mutation", () => {
  assert.match(client, /member\.isActive \? "Inactive" : "Active"/);
  assert.match(client, /title: makeInactive \? "Set User Inactive" : "Set User Active"/);
  assert.match(client, /archived: makeInactive/);
  assert.match(client, /usersCenterMutation\("member-archive"/);
  assert.match(client, /\{id:"archived",label:"Inactive",icon:"lock"\}/);
  assert.match(client, /member\.isActive \? "Active" : "Inactive"/);
  assert.doesNotMatch(client, /<span>\{member\.isActive \? "Archive" : "Unarchive"\}<\/span>/);
});

test("department view has access-protected selection, per-member checkbox, select-all, and bulk editor", () => {
  assert.match(client, /ua-members-panel/);
  assert.match(client, /ua-members-actions/);
  assert.match(client, /access\.pageAccess \|\| access\.featureAccess/);
  assert.match(client, /Select all visible in \{selectedDepartment\.name\}/);
  assert.match(client, /filteredMembers\.every\(\(member\) => selectedMemberSet\.has\(member\.id\)\)/);
  assert.match(client, /filteredMembers\.map\(\(member\) => member\.id\)/);
  assert.match(client, /ua-member-card__select/);
  assert.match(client, /onChange=\{\(event\) => toggleMemberSelection\(member\.id, event\.target\.checked\)\}/);
  assert.match(client, /Edit access for \${selectedMemberIds\.length} selected users in \${selectedDepartment\.name}/);
  assert.match(client, /selectedDepartment\.members\.some\(\(departmentMember\) => departmentMember\.id === member\.id\)/);
  assert.match(client, /function navigateDepartment\(id, push = true\) \{ setSelectionMode\(false\); setSelectedMemberIds\(\[\]\)/);
  assert.match(client, /function backDepartments\(push = true\) \{ setSelectionMode\(false\); setSelectedMemberIds\(\[\]\)/);
  assert.match(client, /onClick=\{\(\) => protectedOpen\(\{ title: "Bulk access editing"/);
});

test("both layouts have smaller cards with responsive styling and a fresh stylesheet version", () => {
  assert.match(css, /v342 — smaller, calmer member cards/);
  assert.match(css, /\.ua-directory-user-card \{\s*gap: 6px;\s*padding: 10px 11px;/);
  assert.match(css, /\.ua-member-card \{\s*padding: 13px;/);
  assert.match(css, /\.ua-member-card\.is-selected/);
  assert.match(css, /@media \(max-width:640px\)/);
  assert.match(page, /users-center-directory-v339\.css\?v=344/);
});

test("all changed JSX syntax parses", () => {
  for (const path of ["components/users-center/UsersCenterClient.jsx", "app/users-center/page.jsx"]) {
    const source = read(path);
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    assert.deepEqual(ast.parseDiagnostics.map((diagnostic) => diagnostic.messageText), [], path);
  }
});
