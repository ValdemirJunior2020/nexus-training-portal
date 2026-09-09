import { NextRequest, NextResponse } from "next/server";
import { canTrain, readDb, writeDb } from "../../../../lib/server-control";
const NEXUS_URL = process.env.NEXUS_URL || "http://127.0.0.1:8787";
export const runtime="nodejs";
export async function POST(request: NextRequest) {
  const body = await request.json(); const trainer=String(request.headers.get("x-nexus-user")||body.user_id||"");
  if(!canTrain(trainer)) return NextResponse.json({error:"Only April Grantham or Karen Caldas can teach Nexus."},{status:403});
  body.user_id=trainer;
  const res = await fetch(`${NEXUS_URL}/learning/teach`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const text = await res.text(); if (!res.ok) return NextResponse.json({ error: text }, { status: res.status }); const out=JSON.parse(text);
  const db=await readDb(); db.training.unshift({id:crypto.randomUUID(),at:new Date().toISOString(),trainer,correction:String(body.content||""),status:"approved",approver:trainer}); db.training=db.training.slice(0,1500); await writeDb(db);
  return NextResponse.json(out);
}
