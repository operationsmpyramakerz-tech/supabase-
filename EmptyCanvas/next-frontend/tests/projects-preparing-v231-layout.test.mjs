import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const jsx = read('components/preparing/ProjectMasterComponents.jsx');
const css = read('public/css/projects-preparing.css');
test('Kit groups use a controlled, accessible accordion instead of opening all groups', () => {
 assert.match(jsx, /aria-expanded=\{isOpen\}/);
 assert.match(jsx, /expandedGroup===null\?index===0/);
 assert.match(jsx, /<section key=\{group\.key\}/);
 assert.doesNotMatch(jsx, /<details key=\{group\.key\}[^>]*open/);
});
test('component forms stay beside the edited row or selected Kit', () => {
 assert.match(jsx, /editor\?\.kind==="update"/);
 assert.match(jsx, /editor\?\.kind==="add"/);
 assert.match(jsx, /<div key=\{row\.id\} className="pr-kit-group-row-shell"/);
 assert.match(jsx, /aria-label=\{`Edit \$\{row\.product_name\} quantity`\}/);
});
test('Kit layout allows natural height without nested scrolling and prevents compressed rows', () => {
 assert.match(css, /\.pr-pbom \.pr-kit-group-list\s*\{[^}]*max-height:none;overflow:visible/s);
 assert.match(css, /\.pr-pbom \.pr-kit-group\s*\{[^}]*flex:0 0 auto/s);
 assert.match(css, /\.pr-pbom \.pr-kit-group-row\s*\{[^}]*min-height:80px/s);
 assert.match(css, /@media\(max-width:560px\)/);
});
test('Page bumps its stylesheet URL so production browsers fetch the fixed layout', () => {
 assert.match(read('app/projects-preparing/page.jsx'), /projects-preparing\.css\?v=236/);
});
test('revised JSX parses cleanly', () => {
 const parsed = ts.createSourceFile('ProjectMasterComponents.jsx', jsx, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText), []);
});
