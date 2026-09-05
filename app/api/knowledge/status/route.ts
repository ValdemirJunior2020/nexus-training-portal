import { NextResponse } from "next/server";
const NEXUS_URL = process.env.NEXUS_URL || "http://127.0.0.1:8787";
export async function GET() {
  try {
    const res = await fetch(`${NEXUS_URL}/knowledge/status`, { cache: "no-store" });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nexus unavailable" }, { status: 503 });
  }
}
