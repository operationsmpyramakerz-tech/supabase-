import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {groupBoxLabels} from '../lib/preparing-box-labels.mjs';
const require=createRequire(import.meta.url);
const ts=require('typescript');
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const production=source('components/preparing/ProjectProductionReceiving.jsx');
const boxes=source('components/preparing/ProjectBoxDistribution.jsx');
const css=source('public/css/projects-preparing.css');

test('Box Distribution navigation is below its three KPI blocks; Production Receiving is unchanged',()=>{
 const stats=boxes.indexOf('aria-label="Box Distribution summary"');
 const navigation=boxes.indexOf('navigation(openBoxLabels,activeCartons.length)');
 const search=boxes.indexOf('aria-label="Search box distribution"');
 assert.ok(stats>=0 && stats<navigation && navigation<search);
 assert.match(production,/const renderBoxNavigation =/);
 assert.match(production,/navigation=\{renderBoxNavigation\}/);
 assert.match(production,/!boxView&&<div className="pr-pt-navigation pr-production-tabs pr-production-navigation"/);
 assert.match(production,/aria-label="Download Production Receiving report"/);
 assert.match(production,/aria-label="Box History"/);
 assert.match(production,/aria-label="Boxes Label"/);
});

test('Box labels panel contains Create Box and grouped boxes instead of inline creation',()=>{
 const mainStart=boxes.indexOf('{mode==="boxes"&&<>');
 const modalStart=boxes.indexOf('{boxesOpen&&<div className="pr-box-labels-overlay"');
 assert.ok(mainStart>0 && modalStart>mainStart);
 const main=boxes.slice(mainStart,modalStart);
 assert.doesNotMatch(main,/pr-box-toolbar|pr-box-pills|pr-box-create|New box label|Kit for new box/);
 const modal=boxes.slice(modalStart);
 for(const label of ['role="dialog"','aria-modal="true"','aria-label="Boxes Label"','aria-label="Close Boxes Label"','Create Box','Kit Groups','boxGroups.map','group.cartons.map','New box label','Kit for new box','Rename','Delete'])assert.ok(modal.includes(label),label);
 assert.match(boxes,/groupBoxLabels\(data\?\.kits,data\?\.cartons\)/);
 assert.match(boxes,/allowed&&<section className="pr-box-labels-create"/);
 assert.match(boxes,/allowed&&<button type="button" className="pr-box-labels-box-menu"/);
});

test('box labels are nested by Kit and cancelled boxes are hidden without losing audit records',()=>{
 const kits=['Stationary Kit','Generic electronics Kit'];
 const cartons=[
  {id:1,kit_name:'Generic electronics Kit',carton_label:'GR-1',status:'draft'},
  {id:2,kit_name:'Generic electronics Kit',carton_label:'GR-2',status:'ready'},
  {id:3,kit_name:'Stationary Kit',carton_label:'ST-1',status:'cancelled'},
  {id:4,kit_name:'Legacy Kit',carton_label:'OLD-1',status:'draft'},
 ];
 const grouped=groupBoxLabels(kits,cartons);
 assert.deepEqual(grouped.map(g=>g.name),['Stationary Kit','Generic electronics Kit','Legacy Kit']);
 assert.deepEqual(grouped.map(g=>g.cartons.map(b=>b.carton_label)),[[],['GR-1','GR-2'],['OLD-1']]);
 assert.deepEqual(groupBoxLabels([],[]),[]);
});

test('existing create, rename, delete and pack flows stay connected to server endpoints',()=>{
 for(const re of [/action:"create"/,/action:"rename"/,/action:"cancel"/,/action:"pack"/,/await refresh\(\)/,/onChanged\?\.\(\)/,/Box Distribution History/])assert.match(boxes,re);
 assert.match(boxes,/setExpandedBoxKit\(newKit\)/);
 assert.match(boxes,/role="menu"/);
 assert.match(boxes,/boxDialog&&/);
});

test('modal is responsive, keyboard accessible and CSS file cache version advances',()=>{
 for(const re of [/pr-box-labels-sheet/,/pr-box-labels-create/,/pr-box-labels-box-grid/,/max-height:min\(83dvh,770px\)/,/@media\(max-width:620px\)/])assert.match(css,re);
 assert.match(boxes,/e\.key==="Escape"/);
 assert.match(boxes,/e\.key!=="Tab"/);
 assert.match(boxes,/role="dialog"/);
 assert.match(source('app/projects-preparing/page.jsx'),/v287-box-labels-modal/);
 for(const file of ['components/preparing/ProjectProductionReceiving.jsx','components/preparing/ProjectBoxDistribution.jsx']){
  const parsed=ts.createSourceFile(file,source(file),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);
  assert.deepEqual(parsed.parseDiagnostics,[],file);
 }
});
