import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { featureGate } from "../../../../lib/feature-permissions-server";
import { assertOrderIdsInScope } from "../../../../lib/order-data-scope";
import { renderPrWord, renderPrPdf, prDownloadName } from "../../../../lib/purchase-requisition-render";
import { normalizePrForm } from "../../../../lib/purchase-requisition-data.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function respondError(message, status=500){return NextResponse.json({error:message||"Purchase Requisition export failed"},{status,headers:{"Cache-Control":"private, no-store"}});}
export async function POST(request){
  const gate = featureGate(await getLegacyAccountGate(["Requested Orders","Operations Orders"]),"orders.operations.export");
  if(!gate.ok)return respondError(gate.error||"Access denied",gate.status||403);
  const body=await request.json().catch(()=>({}));
  const ids=[...new Set((Array.isArray(body.orderIds)?body.orderIds:[]).map(String).filter(id=>/^\d+$/.test(id)))];
  if(!ids.length||ids.length>1000)return respondError("Choose an order (up to 1,000 component rows).",400);
  if(!["word","pdf"].includes(body.kind))return respondError("Invalid document type.",400);
  if(JSON.stringify(body).length>600_000)return respondError("Purchase Requisition is too large.",413);
  try{
    await assertOrderIdsInScope(gate.account,"orders.operations.export",ids);
    const form=normalizePrForm(body.form||{});
    if(form.items.length>1000)return respondError("Too many items.",400);
    const blob=body.kind==="word"?await renderPrWord(form):await renderPrPdf(form);
    const name=prDownloadName(form,body.kind==="word"?"docx":"pdf");
    return new Response(blob,{status:200,headers:{
      "Content-Type":body.kind==="word"?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":"application/pdf",
      "Content-Disposition":`attachment; filename="${name}"`,
      "Cache-Control":"private, no-store",
      "Content-Length":String(blob.length),
    }});
  }catch(err){return respondError(err?.message||"Purchase Requisition export failed",err?.status||500);}
}
