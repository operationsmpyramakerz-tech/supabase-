import { NextResponse } from "next/server";
import { copyKit } from "../../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, kitGate, requestBody } from "../../../../../../lib/proposal-kit-api";
export async function POST(request,{params}){const gate=await kitGate();if(!gate.ok)return gateResponse(gate);try{const {id}=await params;const body=await requestBody(request);return NextResponse.json({ok:true,source:"supabase-next",kit:await copyKit(id,body?.name,gate.account)},{status:201});}catch(error){return errorResponse(error,"Failed to copy kit.");}}
