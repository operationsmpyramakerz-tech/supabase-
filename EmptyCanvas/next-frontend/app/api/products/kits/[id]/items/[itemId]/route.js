import { NextResponse } from "next/server";
import { deleteKitItem, updateKitItem } from "../../../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, kitGate, requestBody } from "../../../../../../../lib/proposal-kit-api";
export async function PATCH(request,{params}){const gate=await kitGate();if(!gate.ok)return gateResponse(gate);try{const {id,itemId}=await params;return NextResponse.json({ok:true,source:"supabase-next",...(await updateKitItem(id,itemId,await requestBody(request),gate.account))});}catch(error){return errorResponse(error,"Failed to update kit component.");}}
export async function DELETE(request,{params}){const gate=await kitGate();if(!gate.ok)return gateResponse(gate);try{const {id,itemId}=await params;return NextResponse.json({ok:true,source:"supabase-next",...(await deleteKitItem(id,itemId,await requestBody(request),gate.account))});}catch(error){return errorResponse(error,"Failed to delete kit component.");}}
