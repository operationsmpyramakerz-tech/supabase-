import { NextResponse } from "next/server";
import { getDirectAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { getProductsList } from "../../../../lib/products-service";
import { filterPreparingProductOptions } from "../../../../lib/preparing-product-options.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});

// Only project managers can list this picker, and only minimal catalog fields
// are returned (no product pricing, private media or unrelated metadata).
export async function GET(req) {
 const gate=await featureGate(await getDirectAccountGate(["Projects Preparing"]),"preparing.manage");
 if(!gate.ok)return reply({ok:false,error:gate.error||"Access denied."},gate.status||403);
 try{
  const q=new URL(req.url).searchParams.get("q")||"";
  const products=filterPreparingProductOptions(await getProductsList(),q);
  return reply({ok:true,products});
 }catch(error){console.error("[preparing:product-options]",error);return reply({ok:false,error:"Product search is currently unavailable."},503);}
}
