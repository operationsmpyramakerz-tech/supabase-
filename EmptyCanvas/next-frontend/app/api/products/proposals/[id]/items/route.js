import { NextResponse } from "next/server";
import { addProposalProduct } from "../../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, proposalGate, requestBody } from "../../../../../../lib/proposal-kit-api";
export async function POST(request,{params}){const gate=await proposalGate();if(!gate.ok)return gateResponse(gate);try{const {id}=await params;return NextResponse.json({ok:true,source:"supabase-next",...(await addProposalProduct(id,await requestBody(request),gate.account))});}catch(error){return errorResponse(error,"Failed to add proposal component.");}}
