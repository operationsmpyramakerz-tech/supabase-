import { NextResponse } from "next/server";
import { deleteKit, getKit, updateKit } from "../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, kitGate, requestBody } from "../../../../../lib/proposal-kit-api";
export const dynamic="force-dynamic";
export async function GET(_request,{params}){const gate=await kitGate();if(!gate.ok)return gateResponse(gate);try{const {id}=await params;return NextResponse.json({ok:true,source:"supabase-next",...(await getKit(id,gate.account))},{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error,"Failed to load kit.");}}
export async function PATCH(request,{params}){const gate=await kitGate();if(!gate.ok)return gateResponse(gate);try{const {id}=await params;return NextResponse.json({ok:true,source:"supabase-next",kit:await updateKit(id,await requestBody(request),gate.account)});}catch(error){return errorResponse(error,"Failed to update kit.");}}
export async function DELETE(request,{params}){const gate=await kitGate();if(!gate.ok)return gateResponse(gate);try{const {id}=await params;await deleteKit(id,await requestBody(request),gate.account);return NextResponse.json({ok:true,source:"supabase-next",deletedId:String(id||"")});}catch(error){return errorResponse(error,"Failed to delete kit.");}}
