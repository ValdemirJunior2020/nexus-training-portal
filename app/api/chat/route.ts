import type { NextRequest } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NEXUS_URL = process.env.NEXUS_URL || "http://127.0.0.1:8787";
type IncomingMessage = { role: "user" | "assistant" | "system"; content: string };
type ChatBody = { messages: IncomingMessage[]; model?: string; sessionId?: string; systemPrompt?: string; engine?: "auto" | "nexus" | "deerflow" };
const encoder = new TextEncoder();
const line = (obj: unknown) => encoder.encode(`${JSON.stringify(obj)}\n`);
function streamResponse(start: (controller: ReadableStreamDefaultController<Uint8Array>) => Promise<void>) {
  const stream = new ReadableStream<Uint8Array>({ async start(controller) { try { await start(controller); } catch (error) { controller.enqueue(line({ type: "error", message: error instanceof Error ? error.message : "Unknown error" })); } finally { controller.close(); } } });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
export async function POST(request: NextRequest) {
  const body = await request.json() as ChatBody;
  if (!Array.isArray(body.messages) || !body.messages.length) return new Response(JSON.stringify({ error: "messages are required" }), { status: 400 });
  return streamResponse(async (controller) => {
    const signal = request.signal;
    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    if (!lastUser) throw new Error("No user message found");
    const previous = body.messages.slice(0, -1).map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const context = [body.systemPrompt ? `SYSTEM INSTRUCTIONS:\n${body.systemPrompt}` : "", previous].filter(Boolean).join("\n\n");
    controller.enqueue(line({ type: "status", message: "Understanding your request…", progress: 12 }));
    const res = await fetch(`${NEXUS_URL}/agent/run`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ prompt: lastUser.content, model: body.model || null, session_id: body.sessionId || "default", mode: "auto", context, allow_tools: true, engine: body.engine || "auto", deerflow_mode: "ultra" }),
    });
    if (!res.ok) throw new Error(`Nexus returned ${res.status}: ${await res.text()}`);
    controller.enqueue(line({ type: "status", message: "Reviewing tools and knowledge…", progress: 68 }));
    const result = await res.json();
    controller.enqueue(line({ type: "status", message: "Preparing the answer…", progress: 90 }));
    controller.enqueue(line({ type: "meta", engine: result?.metadata?.engine || "nexus", model: result?.model || body.model, agentsUsed: result?.agents_used || [], toolsUsed: result?.metadata?.tools_used || [] }));
    const answer = String(result?.answer || "");
    const chunks = answer.match(/[\s\S]{1,28}(?:\s+|$)/g) || [answer];
    for (const text of chunks) { if (signal.aborted) return; controller.enqueue(line({ type: "delta", text })); await new Promise((r) => setTimeout(r, 8)); }
    controller.enqueue(line({ type: "stats", stats: { engine: result?.metadata?.engine || "nexus", model: result?.model || body.model, toolsUsed: result?.metadata?.tools_used || [], agentsUsed: result?.agents_used || [], verified: result?.verified, rounds: result?.rounds } }));
    controller.enqueue(line({ type: "status", message: "Done", progress: 100 }));
    controller.enqueue(line({ type: "done" }));
  });
}
