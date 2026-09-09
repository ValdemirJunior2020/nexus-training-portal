import { NextRequest, NextResponse } from "next/server";
import { canTrain, getUser, isSuper, readDb } from "../../../../lib/server-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalize(value: string) { return value.trim().toLowerCase(); }
function userIdFromSubject(subject: string) {
  const match = subject.match(/\/users\/(\d+)(?:\.json)?$/);
  return match?.[1] || "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalize(String(body.email || ""));
    const zendeskId = String(body.zendeskId || "");
    const cookieSubject = decodeURIComponent(request.cookies.get("nexus_zaf_sub")?.value || "");
    const expectedZendeskId = userIdFromSubject(cookieSubject);
    const devMode = process.env.NEXUS_ZENDESK_DEV_MODE === "true";

    if (!email.endsWith("@hotelplanner.com")) {
      return NextResponse.json({ authorized: false, code: "DOMAIN_NOT_ALLOWED", message: "This email is not authorized to work on HotelPlanner tickets. Please sign in with an @hotelplanner.com account." }, { status: 403 });
    }
    if (!devMode && (!expectedZendeskId || expectedZendeskId !== zendeskId)) {
      return NextResponse.json({ authorized: false, code: "INVALID_ZENDESK_SESSION", message: "Nexus could not verify this Zendesk session." }, { status: 403 });
    }

    const db = await readDb();
    const user = await getUser(email);
    const center = user?.centerId ? db.centers.find(c => c.id === user.centerId) : undefined;
    const authorized = Boolean(user?.enabled && (center ? center.enabled : true) && db.settings.serverEnabled !== false && db.settings.maintenanceMode !== true);
    if (!authorized) {
      return NextResponse.json({ authorized: false, code: "NOT_AUTHORIZED", message: "This email is not authorized to work on HotelPlanner tickets." }, { status: 403 });
    }

    return NextResponse.json({ authorized: true, user: { email: user!.email, displayName: user!.displayName || email, role: user!.role, centerId: user!.centerId || null, canTrain: canTrain(email), isSuper: isSuper(email) }, limits: { maxConcurrentJobs: Number(db.settings.maxConcurrentJobs || 1), maxQueueJobs: Number(db.settings.maxQueueJobs || 100) } });
  } catch {
    return NextResponse.json({ authorized: false, code: "SESSION_ERROR", message: "Nexus could not authorize this Zendesk session." }, { status: 500 });
  }
}
