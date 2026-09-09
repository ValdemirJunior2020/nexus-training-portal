import { NextRequest, NextResponse } from "next/server";
import { readDb, requireRole } from "../../../../lib/server-control";
import { queueSummary } from "../../../../lib/server-queue";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(req:NextRequest){ const email=req.headers.get("x-nexus-user")||""; try{ const me=await requireRole(email,["super_admin","admin"]); const db=await readDb(); return NextResponse.json({me,...db,queue:queueSummary()}); }catch{return NextResponse.json({error:"Forbidden"},{status:403});} }
