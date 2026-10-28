// Shared, side-effect-free helpers for project testing, grouping and printable exports.
const number=value=>Number(value)||0;
export function testingRemaining(row){return Math.max(0,number(row?.received)-number(row?.passed));}
export const TESTING_EXPORT_COLUMNS=[
 {key:"name",label:"Component",fixed:true},
 {key:"code",label:"Code"},
 {key:"required",label:"Required"},
 {key:"received",label:"Testing Received"},
 {key:"passed",label:"Passed"},
 {key:"failed",label:"Failed"},
 {key:"remaining",label:"Remaining"},
 {key:"testedBy",label:"Tested By"},
 {key:"signature",label:"Signature"},
];
const kitKey=source=>source?.kitId?`id:${String(source.kitId).toLowerCase()}`:`name:${String(source?.kitName||"").toLowerCase()}`;
export function testingGroups(items=[],kitGroups=[]){
 const groups=new Map();
 for(const kit of kitGroups){
  const key=String(kit.kit_key||"");
  if(key)groups.set(key,{key,name:String(kit.kit_name||"Kit"),items:[],order:number(kit.sort_order)});
 }
 for(const row of items){
  const entries=Array.isArray(row.sourceKits)?row.sourceKits:[];
  if(!entries.length){
   if(!groups.has("ungrouped"))groups.set("ungrouped",{key:"ungrouped",name:"Unassigned Components",items:[],order:99999});
   groups.get("ungrouped").items.push({...row,kitQuantity:number(row.required)});
   continue;
  }
  const perSchool=entries.reduce((sum,source)=>sum+number(source.quantity),0);
  // A shared product has one test ledger, but each Kit receives its own planned
  // requirement in the printed sheet. The aggregate is not counted twice in totals.
  const schools=perSchool>0?number(row.required)/perSchool:0;
  for(const source of entries){
   const key=kitKey(source);
   if(!groups.has(key))groups.set(key,{key,name:String(source.kitName||"Kit"),items:[],order:groups.size});
   groups.get(key).items.push({...row,projectTotalRequired:number(row.required),required:number(source.quantity)*schools,kitQuantity:number(source.quantity)});
  }
 }
 return [...groups.values()].filter(group=>group.items.length).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name));
}
export function testingExportValue(row,key,blank=false){
 if(key==="signature")return "";
 if(key==="name")return row.name||"";
 if(key==="code")return row.code||"";
 if(key==="required")return String(number(row.required));
 if(blank)return ""; // Never print live test results or identities on physical blank forms.
 if(key==="remaining")return String(testingRemaining(row));
 if(key==="testedBy")return (row.testedBy||[]).map(p=>p.name).join("; ");
 return String(number(row[key]));
}
