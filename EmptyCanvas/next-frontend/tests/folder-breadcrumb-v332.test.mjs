import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const component = read("components/HeaderFolderBreadcrumb.jsx");
const shell = read("components/AppShell.jsx");
const css = read("public/css/erp-global-title-chevron.css");
const preparing = read("components/preparing/PreparingClient.jsx");
const users = read("components/users-center/UsersCenterClient.jsx");
const stock = read("components/stocktaking/StocktakingClient.jsx");
const kits = read("components/kits/KitsClient.jsx");
const proposals = read("components/proposals/ProposalsClient.jsx");

test("folder path is a portal in the existing persistent shell, not a second page header", () => {
  assert.match(component, /createPortal\(/);
  assert.match(component, /\.classic-app-shell \.main-header \.dash-title/);
  assert.match(component, /aria-label="Current folder path"/);
  assert.match(component, /aria-current/);
  assert.match(component, /onClick: segment\.onClick/);
  assert.match(css, /\.dash-title:has\(> \.erp-folder-breadcrumb\) > \.erp-title-chevron \{ display:none!important; \}/);
  assert.equal(shell.split("erp-global-title-chevron.css?v=v332-folder-paths").length - 1, 2);
});

test("Users Center department breadcrumb preserves the folder back handler", () => {
  assert.match(users, /selectedDepartment \? <HeaderFolderBreadcrumb/);
  assert.match(users, /label:"Users Center",icon:"shield",onClick:backDepartments/);
  assert.match(users, /label:selectedDepartment\.name/);
});

test("Stocktaking folder path uses actual active column and resets through existing closeFolder", () => {
  assert.match(stock, /activeColumn \? <HeaderFolderBreadcrumb/);
  assert.match(stock, /label:"Stocktaking",icon:"archive",onClick:closeFolder/);
  assert.match(stock, /label:activeColumn\.label/);
});

test("Proposals detail breadcrumb uses selected proposal and existing back navigation", () => {
  assert.match(proposals, /activeDetail \? <HeaderFolderBreadcrumb/);
  assert.match(proposals, /label:"Proposals",icon:"file-text",onClick:backToProposals/);
  assert.match(proposals, /activeDetail\.proposal\?\.name/);
});

test("Kits path handles both folder and kit depth without changing folder or detail actions", () => {
  assert.match(kits, /label:"Kits",icon:"briefcase",onClick:backToFolderRoot/);
  assert.match(kits, /label:activeFolder\.name,icon:"folder-check"/);
  assert.match(kits, /onClick:\(\) => \{ backToKits\(\); backToFolderRoot\(\); \}/);
  assert.match(kits, /breadcrumbFolder = activeFolder \|\| folders\.find/);
  assert.match(kits, /setActiveFolder\(breadcrumbFolder\); backToKits\(\);/);
  assert.match(kits, /activeDetail\.kit\?\.name/);
});

test("Projects path still uses its own three-level breadcrumb with a visible divider", () => {
  assert.match(preparing, /className="pr-header-path pr-header-path--chevrons"/);
  assert.match(preparing, /onClick=\{onProjects\}/);
  assert.match(preparing, /onClick=\{onProject\}/);
  assert.match(css, /\.dash-title:has\(> \.pr-header-path--chevrons\)::before \{[\s\S]*?display:block!important;/);
  assert.match(css, /\.pr-header-path--chevrons > \.pr-header-path-segment \+ \.pr-header-path-segment \{margin-left:-5px!important;\}/);
});

test("all touched JSX files parse without syntax errors", () => {
  const entries = [
    ["HeaderFolderBreadcrumb.jsx", component],
    ["AppShell.jsx", shell],
    ["UsersCenterClient.jsx", users],
    ["StocktakingClient.jsx", stock],
    ["KitsClient.jsx", kits],
    ["ProposalsClient.jsx", proposals],
  ];
  for (const [name, source] of entries) {
    const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    assert.deepEqual(parsed.parseDiagnostics.map((item) => item.messageText), [], name);
  }
});
