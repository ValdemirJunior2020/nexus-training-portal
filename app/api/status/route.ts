import { NextResponse } from "next/server";
const NEXUS_URL = process.env.NEXUS_URL || "http://127.0.0.1:8787";
export async function GET() {
  try {
    const res = await fetch(`${NEXUS_URL}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return NextResponse.json({
      nexus: { ok: !!data?.ok },
      llamaCpp: { ok: !!data?.llama_cpp },
      deerflow: { ok: !!data?.deerflow?.available },
      activeProvider: data?.local_llm?.active || null,
      raw: data,
    }, { status: res.ok ? 200 : res.status });
  } catch (error) {
    return NextResponse.json({ nexus: { ok: false }, llamaCpp: { ok: false }, deerflow: { ok: false }, error: error instanceof Error ? error.message : "unreachable" }, { status: 503 });
  }
}
