import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ui = read('components/preparing/PreparingClient.jsx');
const css = read('public/css/projects-preparing.css');
const page = read('app/projects-preparing/page.jsx');
const section = css.slice(css.indexOf('/* v416 —'));

// The marked notes are purely presentational; no operational status messages are removed.
test('Project index omits the crossed-out workflow banner and project-count caption', () => {
 assert.doesNotMatch(ui, /<section className="pr-index-hero"/);
 assert.doesNotMatch(ui, /<span className="pr-index-result-count"/);
 assert.match(ui, /pr-index-stats/);
 assert.match(ui, /projectFiltered\.map/);
});
test('Project overview keeps its headings and metrics but drops both marked info messages', () => {
 assert.doesNotMatch(ui, /Key project information and status/);
 assert.doesNotMatch(ui, /Project completion across all six preparation stages/);
 assert.match(ui, /<h2>Project Overview<\/h2>/);
 assert.match(ui, /<h2>Overall Progress<\/h2>/);
 assert.match(ui, /pr-project-overall-track/);
});
test('All six stages retain the shared compact styling hook', () => {
 for (const file of ['ProjectProductionIntake','ProjectTesting','ProjectWarehouseReceiving','ProjectProductionReceiving','SchoolKitCartons']) {
  assert.match(read(`components/preparing/${file}.jsx`), /pr-intake-v401/, file);
 }
 assert.match(read('components/preparing/ProjectProductionReceiving.jsx'), /pr-box-v409/);
 assert.match(read('components/preparing/ProjectBoxDistribution.jsx'), /pr-intake-tabs-toolbar/);
});
test('The signoff no longer stretches to a tall empty card on mobile', () => {
 assert.match(section, /\.pr-intake-signoff \.pr-stage-closure\s*\{\s*height:auto;min-height:0/);
 assert.match(section, /@media \(max-width: 800px\)/);
 assert.match(section, /\.pr-sc-header \{gap:9px/);
});
test('Mobile toolbar stays on a single line, with compact buttons and a scrollable tab strip', () => {
 assert.match(section, /\.pr-intake-tabs-toolbar\s*\{[^}]*flex-wrap:nowrap/);
 assert.match(section, /\.pr-intake-tabs-toolbar \.pr-stage-filter-tabs\s*\{[^}]*overflow-x:auto/s);
 assert.match(section, /\.pr-stage-filter-tabs>button\s*\{[^}]*min-height:36px/s);
 assert.match(section, /\.pr-intake-tabs-actions\s*\{[^}]*width:auto/);
});
test('Search remains anchored in its slot and expands LEFT above tabs, including narrow screens', () => {
 assert.match(section, /\.pr-intake-search-control\s*\{[^}]*position:absolute;top:0;right:0;left:auto/s);
 assert.match(css, /\/\* v417[^]*?\.pr-intake-search-control\s*\{[^}]*flex-direction:row;/s);
 assert.match(section, /\.pr-intake-search-control\.is-open\s*\{[^}]*top:0;right:0;left:auto/s);
 assert.match(section, /width:min\(320px,calc\(100vw - 132px\)\)/);
 assert.doesNotMatch(css, /top:calc\(100% \+ 8px\);right:-88px/);
});
test('New styles are cache-busted so mobile receives the patch', () => {
 assert.match(page, /v417-header-search-parity-history-in-title/);
});
