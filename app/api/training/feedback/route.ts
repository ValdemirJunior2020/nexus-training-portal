import { NextRequest, NextResponse } from "next/server";
const NEXUS_URL = process.env.NEXUS_URL || "http://127.0.0.1:8787";
export async function POST(request: NextRequest) {
  const body = await request.json();
  const res = await fetch(`${NEXUS_URL}/learning/feedback`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ error: text }, { status: res.status });
  return NextResponse.json(JSON.parse(text));
}
