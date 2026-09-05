import { NextRequest, NextResponse } from "next/server";

const NEXUS_URL = process.env.NEXUS_URL || "http://127.0.0.1:8787";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const caseText = String(body.caseText || "").trim();
  if (!caseText) return NextResponse.json({ error: "caseText is required" }, { status: 400 });

  const trainer = String(body.trainer || "Junior").trim() || "Junior";
  const sessionId = String(body.sessionId || `training-${Date.now()}`);
  const prompt = [
    "TRAINING REVIEW — HOTELPLANNER ZENDESK OPERATIONS",
    "Analyze the case using the authoritative Ticket Matrix when relevant.",
    "Do not invent requirements that are not explicitly supported by the Matrix.",
    "Return: concern, matched Matrix rule(s), required next actions, escalation/ticket/refund/VIPRES requirements when applicable, and a concise internal-note suggestion.",
    "Clearly distinguish official Matrix requirements from any learned memory or inference.",
    "CASE:",
    caseText,
  ].join("\n\n");

  try {
    const res = await fetch(`${NEXUS_URL}/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        session_id: sessionId,
        user_id: trainer,
        mode: "qa",
        engine: "nexus",
        allow_tools: true,
        allow_learning: false,
      }),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) return NextResponse.json({ error: text || `Nexus returned ${res.status}` }, { status: res.status });
    return NextResponse.json(JSON.parse(text));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nexus unavailable" }, { status: 503 });
  }
}
