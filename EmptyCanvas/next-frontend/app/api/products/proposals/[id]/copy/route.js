import { NextResponse } from "next/server";
import { copyProposal } from "../../../../../../lib/proposal-kit-service";
import { errorResponse, gateResponse, proposalGate, requestBody } from "../../../../../../lib/proposal-kit-api";
export async function POST(request,{params}){const gate=await proposalGate();if(!gate.ok)return gateResponse(gate);try{const {id}=await params;const body=await requestBody(request);return NextResponse.json({ok:true,source:"supabase-next",proposal:await copyProposal(id,body?.name,gate.account)},{status:201});}catch(error){return errorResponse(error,"Failed to copy proposal.");}}
