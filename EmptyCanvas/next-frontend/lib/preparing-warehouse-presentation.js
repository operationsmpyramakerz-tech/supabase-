import "server-only";
import {preparingDisplayCodeResolver} from "./preparing-display-code.mjs";
import {warehouseWorkspace} from "./preparing-warehouse";
import {rpc} from "./supabase-rest";
import {getProductsList} from "./products-service";
import {getTeamMemberPublicProfile} from "./team-members-service";

const safePhoto=value=>/^https?:\/\//i.test(String(value||"").trim())?String(value).trim():"";
const productKey=value=>String(value||"").trim().toLowerCase();

export async function warehousePresentationWorkspace(projectId){
 const snapshot=await warehouseWorkspace(projectId);
 // Stage 3 first tab reflects Stage 1 receiving, not the testing/return ledgers.
 // Use the same authoritative snapshot RPC as Production Receiving.
 const intake=await rpc("erp_preparing_intake_snapshot_v388",{p_project_id:snapshot.projectId},{profileName:"preparing.warehouse.production-intake"});
 const productsPromise=getProductsList().catch(()=>[]);
 const users=[...new Map((snapshot.receipts||[]).filter(row=>row.created_by_id&&row.created_by_name).map(row=>[String(row.created_by_id),row])).values()].slice(0,60);
 const profiles=new Map();
 await Promise.all(Array.from({length:Math.min(6,users.length)},async(_,worker)=>{
  for(let i=worker;i<users.length;i+=6){
   const person=users[i];
   const profile=await getTeamMemberPublicProfile(person.created_by_id).catch(()=>null);
   if(profile)profiles.set(String(person.created_by_id),safePhoto(profile.photoUrl));
  }
 }));
 const products=await productsPromise;
 const resolveDisplayCode=preparingDisplayCodeResolver(products);
 const byProductId=new Map(),byDisplayCode=new Map(),byName=new Map();
 for(const product of Array.isArray(products)?products:[]){
  byProductId.set(productKey(product.id),product);
  if(product.displayId)byDisplayCode.set(productKey(product.displayId),product);
  const key=productKey(product.name);
  if(key)byName.set(key,byName.has(key)?null:product);
 }
 return {...snapshot,intakeBalances:intake?.balances||[],
  receipts:(snapshot.receipts||[]).map(row=>({...row,created_by_photo_url:profiles.get(String(row.created_by_id))||""})),
  items:(snapshot.items||[]).map(row=>{
   const product=byProductId.get(productKey(row.product_id))||byDisplayCode.get(productKey(row.product_id))||byName.get(productKey(row.product_name));
   // A reused product code must not display another component's image.
   const valid=product&&productKey(product.name)===productKey(row.product_name);
   const main=valid?safePhoto(product.imageUrl):"";
   const attachments=valid?(product.attachments||[]).filter(file=>/^image\/(png|jpeg|gif|webp)$/i.test(String(file.type||""))||/\.(?:png|jpe?g|gif|webp)$/i.test(String(file.name||""))).map(file=>safePhoto(file.url)).filter(Boolean):[];
   return {...row,displayCode:resolveDisplayCode(row.product_id,row.product_name),imageUrls:[...new Set([main,...attachments].filter(Boolean))]};
  }),
 };
}
