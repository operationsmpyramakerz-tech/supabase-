import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),postcss=require('postcss');
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const file='components/preparing/StageExportDialog.jsx';
// Lightweight hook/JSX harness: run the actual component's handlers without
// requiring a browser or a live Supabase connection.
function mount(overrides={}){
 let index=0,slots=[],calls=[];
 const react={useId:()=>':test:',useEffect:()=>{},useRef:value=>{const i=index++;return slots[i]??(slots[i]={current:value});},useState:value=>{const i=index++;if(!(i in slots))slots[i]=value;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];}};
 const jsx=(type,props)=>({type,props:props||{}});
 const compiled=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};
 new Function('require','module','exports','document','HTMLElement',compiled)(name=>{
  if(name==='react')return react;
  if(name==='react-dom')return {createPortal:node=>node};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(name.endsWith('.css'))return {default:new Proxy({}, {get:(_,key)=>key})};
  throw Error(name);
 },mod,mod.exports,{body:{}},class {});
 const props={title:'Export Testing',columnOptions:[{key:'name',label:'Component',fixed:true},{key:'tested',label:'Tested'}],columns:['name','tested'],groups:[{key:'a',name:'Addons'},{key:'b',name:'Filament'},{key:'c',name:'Tools'}],groupKeys:[],busy:false,onSelectAllColumns:()=>calls.push(['allColumns']),onToggleColumn:key=>calls.push(['column',key]),onSelectAllGroups:()=>calls.push(['allKits']),onToggleGroup:key=>calls.push(['kit',key]),onClose:()=>calls.push(['close']),onCSV:blank=>calls.push(['csv',blank]),onPDF:blank=>calls.push(['pdf',blank]),...overrides};
 function render(){index=0;return mod.exports.default(props);}
 function walk(node){if(Array.isArray(node))return node.flatMap(walk);if(!node||typeof node!=='object')return [];return [node,...walk(node.props?.children)];}
 function find(predicate){const node=walk(render()).find(predicate);assert.ok(node,'missing node');return node;}
 const text=node=>Array.isArray(node)?node.map(text).join(''):typeof node==='string'?node:typeof node==='number'?String(node):node&&typeof node==='object'?text(node.props?.children):'';
 const button=label=>find(n=>n.type==='button'&&text(n.props.children)===label);
 return {props,calls,button,find,render,text};
}
test('all stages reuse the approved responsive CSS and correct export callbacks',()=>{
 const targets=[['ProjectTesting','Export Testing','TESTING_EXPORT_COLUMNS','exportCSV','exportPDF'],['ProjectWarehouseReceiving','Export Warehouse Return','WAREHOUSE_COLUMNS','exportCSV','exportPDF'],['ProjectProductionReceiving','Export Operations Receiving','exportColumns','exportCsv','exportPdf'],['ProjectProductionReceiving','Export Box Distribution','exportColumns','exportCsv','exportPdf']];
 for(const [name,title,options,csv,pdf] of targets){const ui=read(`components/preparing/${name}.jsx`);assert.ok(ui.includes(`<StageExportDialog title="${title}" columnOptions={${options}}`));assert.ok(ui.includes(`onCSV={${csv}} onPDF={${pdf}}`));assert.doesNotMatch(ui,/pr-pt-export-overlay/);}
 const css=read('components/preparing/ProductionIntakeExport.module.css');assert.doesNotThrow(()=>postcss.parse(css));assert.match(css,/\.modal \{ width: 100%;[^\n]+border-radius: 22px 22px 0 0/);assert.match(css,/\.overlay \{ align-items: flex-end; padding: 40px 0 0;/);
 assert.match(read(file),/import exportStyles from "\.\/ProductionIntakeExport\.module\.css"/);
 for(const name of new Set([file,...targets.map(([name])=>`components/preparing/${name}.jsx`)])){const tree=ts.createSourceFile(name,read(name),ts.ScriptTarget.Latest,true,ts.ScriptKind.JSX);assert.deepEqual(tree.parseDiagnostics,[],name);}
});
for(const [format,sheet,expected] of [['PDF','Blank sheet',['pdf',true]],['PDF','Values',['pdf',false]],['CSV','Blank sheet',['csv',true]],['CSV','Values',['csv',false]]]){
 test(`${format} / ${sheet} dispatches correct existing export handler`,async()=>{const m=mount();assert.equal(m.button('PDF').props['aria-pressed'],true);assert.equal(m.button('Blank sheet').props['aria-pressed'],true);m.button(format).props.onClick();m.button(sheet).props.onClick();await m.button('Export').props.onClick();assert.deepEqual(m.calls,[expected]);});
}
test('kit dropdown, fixed component, select all and last-kit protection',()=>{const m=mount();const input=()=>m.find(n=>n.type==='input'&&n.props.disabled);assert.equal(input().props.checked,true);m.button('Select all').props.onClick();m.button('All kits').props.onClick();m.find(n=>n.type==='button'&&n.props['aria-expanded']===false).props.onClick();assert.equal(m.find(n=>n.props.className==='kitOptions').props.hidden,false);const labels=m.find(n=>n.props.className==='kitOptions').props.children;labels[1].props.children[0].props.onChange();assert.deepEqual(m.calls,[['allColumns'],['allKits'],['kit','b']]);m.props.groupKeys=['a'];const kitLabels=m.find(n=>n.props.className==='kitOptions').props.children;assert.equal(kitLabels[0].props.children[0].props.disabled,true);assert.equal(kitLabels[1].props.children[0].props.disabled,false);m.props.groups=[];assert.equal(m.button('Export').props.disabled,true);});
test('export errors remain in the dialog; double submit is blocked',async()=>{let release,count=0;const pending=new Promise((_,reject)=>{release=reject;});const m=mount({onPDF:()=>{count++;return pending;}});const submit=m.button('Export').props.onClick;const first=submit();await submit();assert.equal(count,1);assert.equal(m.button('Exporting…').props.disabled,true);release(new Error('PDF failed'));await first;assert.equal(m.find(n=>n.props.role==='alert').props.children,'PDF failed');assert.equal(m.button('Export').props.disabled,false);});
