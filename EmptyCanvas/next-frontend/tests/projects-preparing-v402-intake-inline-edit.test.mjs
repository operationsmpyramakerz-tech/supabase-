import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const src=readFileSync(new URL('../components/preparing/ProjectProductionIntake.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/css/projects-preparing.css',import.meta.url),'utf8');

test('Production Receiving JSX parses and the All Components tab is read-only',()=>{
 assert.equal(ts.createSourceFile('ProjectProductionIntake.jsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX).parseDiagnostics.length,0);
 assert.match(src,/canEditTab = canTest && filter !== "all" && editTabs\[filter\] !== false/);
 assert.match(src,/if\(busy\|\|!canEditTab\)return/);
 assert.match(src,/onClick=\{\(\)=>edit\(r\)\}/);
});

test('Received is edited in place while required, remaining, avatars stay on one row',()=>{
 assert.match(src,/<div className="pr-intake-cell"><span>Required<\/span>/);
 assert.match(src,/pr-intake-cell--received\$\{isEditing\?" is-inline-edit"/);
 assert.match(src,/<StageQuantityInput id=\{`pr-intake-qty-\$\{r\.id\}`\}/);
 assert.match(src,/<div className="pr-intake-cell"><span>Remaining<\/span>/);
 assert.match(src,/<EditorAvatars people=\{r\.testedBy\|\|\[\]\}\/>/);
 assert.doesNotMatch(src,/\{isEditing\?<div className="pr-intake-receive-input"/);
 assert.match(src,/pr-intake-action--save/);
 assert.match(src,/pr-intake-action--cancel/);
 assert.match(src,/event\.key==="Enter"/);
 assert.match(src,/event\.key==="Escape"/);
});

test('edit actions remain compact with a mobile same-row horizontal scroll fallback',()=>{
 assert.match(css,/v402 — Production Receiving/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-component\.is-editing \.pr-intake-component-main/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-cell--received\.is-inline-edit input/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-edit-icon,/);
 assert.match(css,/\.pr-intake-v401 \.pr-intake-action--save/);
 assert.match(css,/@media \(max-width:720px\)/);
 assert.match(css,/\.pr-intake-v401 \.pr-pt-kit-body \{overflow-x:auto/);
});
