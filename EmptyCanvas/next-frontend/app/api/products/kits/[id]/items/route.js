import { NextResponse } from "next/server";
import { addKitProduct } from "../../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, kitGate, requestBody } from "../../../../../../lib/proposal-kit-api";
export async function POST(request,{params}){const gate=await kitGate();if(!gate.ok)return gateResponse(gate);try{const {id}=await params;return NextResponse.json({ok:true,source:"supabase-next",...(await addKitProduct(id,await requestBody(request),gate.account))});}catch(error){return errorResponse(error,"Failed to add kit component.");}}
