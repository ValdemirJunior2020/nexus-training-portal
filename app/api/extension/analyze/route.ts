import { NextRequest, NextResponse } from "next/server";
import { submit } from "../../../../lib/server-queue";
import { getUser, readDb } from "../../../../lib/server-control";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalize(value: string) { return value.trim().toLowerCase(); }
function userIdFromSubject(subject: string) { const match = subject.match(/\/users\/(\d+)(?:\.json)?$/); return match?.[1] || ""; }

export async function POST(req: NextRequest) {
  try {
    const email = normalize(req.headers.get("x-nexus-user") || "");
    if (!email.endsWith("@hotelplanner.com")) return NextResponse.json({ error: "This email is not authorized to work on HotelPlanner tickets." }, { status: 403 });
    const devMode = process.env.NEXUS_ZENDESK_DEV_MODE === "true";
    const subject = decodeURIComponent(req.cookies.get("nexus_zaf_sub")?.value || "");
    const zendeskId = userIdFromSubject(subject);
    const payload = await req.json();
    if (!devMode && (!zendeskId || String(payload.zendesk_user_id || "") !== zendeskId)) return NextResponse.json({ error: "Nexus could not verify this Zendesk session." }, { status: 403 });
    const db = await readDb();
    const user = await getUser(email);
    const center = user?.centerId ? db.centers.find(c => c.id === user.centerId) : undefined;
    if (!user?.enabled || (center && !center.enabled) || db.settings.serverEnabled === false || db.settings.maintenanceMode === true) return NextResponse.json({ error: "This Zendesk account is not authorized to use Nexus." }, { status: 403 });
    payload.user_id = email;
    const rules = db.matrixRules.filter(r => r.enabled);
    if (rules.length) {
      const summary = rules.map(r => `[${r.section}] ${r.issue}: ${r.instructions}`).join("\n");
      payload.reservation_context = [payload.reservation_context || "", `ADMIN MATRIX RULES (official local additions; existing Nexus Ticket Matrix remains authoritative):\n${summary}`].filter(Boolean).join("\n\n");
    }
    const job = await submit(email, payload);
    return NextResponse.json(job, { status: 202 });
  } catch (e) {
    const m = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: m }, { status: m === "ACCESS_DISABLED" ? 403 : m === "QUEUE_FULL" ? 429 : 500 });
  }
}
