import { NextRequest } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function b64urlDecode(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4), "base64");
}

function verifyRs256(token: string, publicKey: string, audience: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("INVALID_ZAF_TOKEN");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(b64urlDecode(encodedHeader).toString("utf8")) as { alg?: string; typ?: string };
  const payload = JSON.parse(b64urlDecode(encodedPayload).toString("utf8")) as Record<string, unknown>;
  if (header.alg !== "RS256") throw new Error("INVALID_ZAF_ALGORITHM");
  const signature = b64urlDecode(encodedSignature);
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  if (!verifier.verify(publicKey, signature)) throw new Error("INVALID_ZAF_SIGNATURE");
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) throw new Error("EXPIRED_ZAF_TOKEN");
  if (typeof payload.nbf === "number" && payload.nbf > now) throw new Error("EARLY_ZAF_TOKEN");
  if (payload.aud !== audience) throw new Error("INVALID_ZAF_AUDIENCE");
  if (typeof payload.sub !== "string") throw new Error("INVALID_ZAF_SUBJECT");
  return payload;
}

function html(status: "ok" | "error", message = "") {
  const safe = JSON.stringify(message).replace(/</g, "\\u003c");
  const boot = JSON.stringify({ status, message }).replace(/</g, "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nexus Zendesk Copilot</title><style>html,body{margin:0;padding:0;background:#101318;color:#f4f7fb;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}#app{min-height:180px}</style></head><body><div id="app"></div><script>window.__NEXUS_ZAF_BOOT__=${boot};window.__NEXUS_ZAF_MESSAGE__=${safe};</script><script src="https://static.zdassets.com/zendesk_app_framework_sdk/2.0/zaf_sdk.min.js"></script><script src="/zendesk-app/runtime.js"></script></body></html>`;
}

export async function GET(request: NextRequest) {
  if (process.env.NEXUS_ZENDESK_DEV_MODE === "true") {
    return new Response(html("ok"), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  return new Response(html("error", "Nexus Zendesk app requires a signed Zendesk request. Install the private app with signedUrls enabled."), { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const token = String(form.get("token") || "");
    const publicKey = process.env.ZENDESK_APP_PUBLIC_KEY || "";
    const audience = process.env.ZENDESK_APP_AUDIENCE || "";
    if (!token || !publicKey || !audience) throw new Error("ZAF_AUTH_NOT_CONFIGURED");
    const claims = verifyRs256(token, publicKey, audience);
    const response = new Response(html("ok"), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    response.headers.set("Set-Cookie", `nexus_zaf_sub=${encodeURIComponent(String(claims.sub))}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=300`);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZAF authentication failed";
    return new Response(html("error", message === "ZAF_AUTH_NOT_CONFIGURED" ? "Nexus Zendesk authentication is not configured on the server." : "Nexus could not verify this Zendesk session."), { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
}
