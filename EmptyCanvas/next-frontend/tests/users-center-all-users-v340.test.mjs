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

test("All Users is the default tab and Departments is the second tab", () => {
  assert.match(client, /\[directoryTab, setDirectoryTab\] = useState\("users"\)/);
  assert.match(client, /\[\{id:"users",label:"All Users",icon:"users"\},\{id:"departments",label:"Departments",icon:"grid"\}/);
  assert.match(client, /aria-pressed=\{directoryTab === item\.id\}/);
  assert.match(client, /changeDirectoryTab\(item\.id\)/);
  assert.match(client, /function navigateDepartment\(id, push = true\) \{[^\n]*setDirectoryTab\("departments"\)/);
});

test("All Users pulls actual members from every department and deduplicates by ID", () => {
  assert.match(client, /const membersWithDepartments = useMemo/);
  assert.match(client, /directory\.departments\.flatMap/);
  assert.match(client, /const key = text\(member\.id\)/);
  assert.match(client, /if \(seen\.has\(key\)\) return false/);
  assert.match(client, /visibleUsers\.map\(\(member\) => <UserDirectoryCard/);
  assert.doesNotMatch(client, /\[\s*\{\s*name:\s*"Abdullah"/);
});

test("user list search, sorting and status filters operate on people, not departments", () => {
  assert.match(client, /member\.name\} \$\{member\.position\} \$\{member\.directoryDepartment\} \$\{member\.email\} \$\{member\.phone\} \$\{member\.employeeCode\}/);
  assert.match(client, /sortMode === "name-desc"/);
  assert.match(client, /sortMode === "department"/);
  assert.match(client, /directoryTab === "active" && member\.isActive !== true/);
  assert.match(client, /directoryTab === "archived" && member\.isActive !== false/);
  assert.match(client, /isMemberDirectoryTab \? "Search users, departments or emails\.\.\."/);
});

test("member actions remain behind the existing feature/password authorization", () => {
  assert.match(client, /access\.memberCreate && directoryTab !== "archived" && !selectionMode \? <AddMemberCard/);
  assert.match(client, /access\.memberEdit \? <div className="ua-member-card__dual-actions"/);
  assert.match(client, /access\.memberMove \? <button/);
  assert.match(client, /access\.memberDelete \? <button/);
  assert.match(client, /protectedOpen\(\{ title: "Edit team member"/);
  assert.match(client, /protectedOpen\(\{ title: "Move team member"/);
  assert.match(client, /function deleteMember\(member\) \{ protectedOpen/);
  assert.match(client, /<AddDepartmentFolder onClick=\{openDepartmentCreate\}/);
});

test("mobile, tablet, dark-mode and updated CSS cache key are included", () => {
  assert.match(css, /\.ua-directory-users__grid/);
  assert.match(css, /\.ua-directory-user-card__head/);
  assert.match(css, /html\[data-theme="dark"\] body\.user-access-page \.ua-directory-v339 \.ua-directory-user-card/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /ua-directory-tabs \{grid-template-columns: repeat\(5/);
  assert.match(page, /users-center-directory-v339\.css\?v=345/);
});

test("edited JSX files parse", () => {
  for (const name of ["components/users-center/UsersCenterClient.jsx", "app/users-center/page.jsx"]) {
    const source = read(name);
    const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    assert.deepEqual(parsed.parseDiagnostics.map((diagnostic) => diagnostic.messageText), [], name);
  }
});
