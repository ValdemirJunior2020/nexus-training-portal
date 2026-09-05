import { NextRequest, NextResponse } from "next/server";
const NEXUS_URL = process.env.NEXUS_URL || "http://127.0.0.1:8787";
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const res = await fetch(`${NEXUS_URL}/knowledge/ticket-matrix?q=${encodeURIComponent(q)}&limit=8`, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ error: text }, { status: res.status });
  return NextResponse.json(JSON.parse(text));
}
