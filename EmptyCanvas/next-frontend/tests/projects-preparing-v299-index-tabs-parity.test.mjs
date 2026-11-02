import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ui = read('components/preparing/PreparingClient.jsx');
const css = read('public/css/projects-preparing.css');
const page = read('app/projects-preparing/page.jsx');
const indexTabs = ui.split('<div className="pr-index-controls pr-project-detail-tabs">')[1]?.split('</div>')[0] || '';

test('project index filter tabs have their matching icon and retain click and accessibility behavior', () => {
  assert.ok(indexTabs, 'index tabs use the same bar class as detail tabs');
  for (const [key, icon] of [['all','folder'],['active','play'],['delivered','truck'],['closed','check']]) {
    assert.match(ui, new RegExp(`key: "${key}", label: "[^"]+", icon: "${icon}"`));
  }
  assert.match(indexTabs, /pr-project-tab pr-project-detail-tab/);
  assert.match(indexTabs, /<Ico name=\{tab\.icon\} size=\{17\}\/>/);
  assert.match(indexTabs, /aria-pressed=\{projectFilter === tab\.key\}/);
  assert.match(indexTabs, /onClick=\{\(\) => setProjectFilter\(tab\.key\)\}/);
  assert.match(page, /v299-matched-index-tabs-icons/);
});

test('index tabs match project detail in active underline, dimensions, colors and responsive behavior', () => {
  const styles = css.split('/* v299 —')[1] || '';
  assert.match(styles, /\.pr-root--index \.pr-index-controls\.pr-project-detail-tabs/);
  assert.match(styles, /min-height:59px;padding:5px/);
  assert.match(styles, /border:1px solid #e8eaf0;border-radius:18px;background:#f7f8fa/);
  assert.match(styles, /min-width:126px;min-height:47px;padding:0 17px/);
  assert.match(styles, /\.pr-root--index \.pr-project-tab\.pr-project-detail-tab\.is-active::after/);
  assert.match(styles, /background:#ff7819/);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /@media\(max-width:480px\)/);
  assert.match(styles, /\.pr-root--index \.pr-index-result-count/);
  const parsed = ts.createSourceFile('PreparingClient.jsx', ui, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics.map(e => e.messageText), []);
});
