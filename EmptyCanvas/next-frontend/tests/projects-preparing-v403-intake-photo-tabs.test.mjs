import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const source=readFileSync(new URL('../components/preparing/ProjectProductionIntake.jsx', import.meta.url),'utf8');
const styles=readFileSync(new URL('../public/css/projects-preparing.css', import.meta.url),'utf8');

test('Production Receiving title has no breadcrumb or subtitle and JSX is valid',()=>{
 const parsed=ts.createSourceFile('ProjectProductionIntake.jsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
 assert.deepEqual(parsed.parseDiagnostics.map(e=>e.messageText),[]);
 assert.match(source,/<h3>Production Receiving<\/h3>/);
 assert.doesNotMatch(source,/Receive components from production to move them to the testing stage\./);
 assert.doesNotMatch(source,/Projects Preparing <span className="pr-pt-overline-sep">/);
});

test('Received view has only Required and Received, pending view only Remaining then Received',()=>{
 const rows=source.slice(source.indexOf('<div className={`pr-intake-component-main'),source.indexOf('<EditorAvatars people={r.testedBy'));
 assert.match(rows,/filter!=="pending"&&<div className="pr-intake-cell"><span>Required<\/span>/);
 assert.match(rows,/filter==="pending"&&<div className="pr-intake-cell"><span>Remaining<\/span>/);
 assert.ok(rows.indexOf('filter==="pending"')<rows.indexOf('pr-intake-cell--received'));
 assert.match(rows,/filter==="all"&&<div className="pr-intake-cell"><span>Remaining<\/span>/);
 assert.doesNotMatch(rows,/filter==="received"&&<div className="pr-intake-cell"><span>Remaining<\/span>/);
 assert.match(styles,/pr-intake-cols--pending/);
 assert.match(styles,/pr-intake-cols--received/);
});

test('Image preview is large, centered, non-clipping and preserves photo navigation',()=>{
 assert.match(source,/import \{createPortal\} from "react-dom";/);
 assert.match(source,/createPortal\(/);
 assert.match(source,/, document.body\s*\)/);
 assert.match(source,/pr-intake-image-overlay/);
 assert.match(source,/aria-modal="true"/);
 assert.match(source,/preview\.imageUrls\[previewIndex\]/);
 assert.match(source,/Previous image/);
 assert.match(source,/Next image/);
 assert.match(styles,/\.pr-intake-image-modal\s*\{/);
 assert.match(styles,/width:min\(860px,100%\)/);
 assert.match(styles,/max-height:min\(75dvh,720px\)/);
 assert.match(styles,/place-items:center/);
});

test('Actionable tabs retain inline editing, overview stays read-only',()=>{
 assert.match(source,/canEditTab = canTest && filter !== "all" && editTabs\[filter\] !== false/);
 assert.match(source,/StageQuantityInput/);
 assert.match(source,/pr-intake-action--save/);
 assert.match(source,/pr-intake-action--cancel/);
});
