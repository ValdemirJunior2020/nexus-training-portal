import { NextResponse } from "next/server";
const NEXUS_URL = process.env.NEXUS_URL || "http://127.0.0.1:8787";
export async function GET() {
  try {
    const res = await fetch(`${NEXUS_URL}/v1/models`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Nexus returned ${res.status}`);
    const data = await res.json();
    const models = Array.isArray(data?.data) ? data.data.map((m: { id?: string }) => m.id).filter(Boolean) : [];
    return NextResponse.json({ models, source: "llama_cpp" });
  } catch (error) {
    return NextResponse.json({ models: [], source: "none", error: error instanceof Error ? error.message : "llama.cpp unavailable" }, { status: 503 });
  }
}
