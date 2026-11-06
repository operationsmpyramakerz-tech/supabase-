import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const jsx = read("components/preparing/PreparingClient.jsx");
const css = read("public/css/projects-preparing.css");
const page = read("app/projects-preparing/page.jsx");

test("Project header path uses icon chevrons without changing navigation handlers", () => {
  const part = jsx.split("function ProjectHeaderPath(")[1].split("export default function PreparingClient")[0];
  assert.match(part, /pr-header-path--chevrons/);
  assert.match(part, /onClick=\{onProjects\}/);
  assert.match(part, /onClick=\{onProject\}/);
  assert.match(part, /Ico name="folder"/);
  assert.match(part, /Ico name="layers"/);
  assert.match(part, /Ico name="school"/);
  assert.match(part, /aria-current="page"/);
  assert.doesNotMatch(part, /<Ico name="arrow"/);
});

test("Chevron stylesheet shows inactive gray and current orange, with responsive and dark themes", () => {
  assert.match(css, /\.pr-header-path--chevrons > \.pr-header-path-segment/);
  assert.match(css, /clip-path:polygon/);
  assert.match(css, /\.pr-header-path--chevrons > \.pr-header-path-current[\s\S]*?background:#f97316;/);
  assert.match(css, /html\[data-theme="dark"\] \.pr-header-path--chevrons/);
  assert.match(css, /@media \(max-width:768px\)/);
  assert.match(css, /@media \(max-width:480px\)/);
  assert.match(page, /v330-chevron-breadcrumb/);
});

test("Both updated JSX files parse without syntax errors", () => {
  for (const [name, source] of [["PreparingClient.jsx", jsx], ["page.jsx", page]]) {
    const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    assert.deepEqual(parsed.parseDiagnostics.map(item => item.messageText), [], name);
  }
});
