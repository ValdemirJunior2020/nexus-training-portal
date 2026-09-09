import { promises as fs } from "fs";
import path from "path";

export type Role = "super_admin" | "admin" | "supervisor" | "trainer" | "agent";
export type Center = { id: string; name: string; enabled: boolean; maxQueue: number; priority: number };
export type User = { email: string; displayName?: string; role: Role; centerId?: string; enabled: boolean };
export type MatrixRule = { id: string; section: string; issue: string; instructions: string; slack?: string; refundQueue?: string; createTicket?: string; supervisor?: string; vipres?: string; enabled: boolean; version: number; updatedBy: string; updatedAt: string };
export type AuditItem = { id: string; at: string; actor: string; action: string; target: string; before?: unknown; after?: unknown };
export type TrainingItem = { id: string; at: string; trainer: string; ticketId?: string; itinerary?: string; original?: string; correction: string; status: "pending" | "approved" | "rejected"; approver?: string };
export type ControlDb = { users: User[]; centers: Center[]; matrixRules: MatrixRule[]; audit: AuditItem[]; training: TrainingItem[]; settings: Record<string, unknown> };

const SUPER = "april.grantham@hotelplanner.com";
const ADMIN = "karen.caldas@hotelplanner.com";
const TRAINERS = new Set([SUPER, ADMIN]);
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "zendesk-control.json");

const seed = (): ControlDb => ({
  users: [
    { email: "April.Grantham@HotelPlanner.com", displayName: "April Grantham", role: "super_admin", enabled: true },
    { email: "karen.caldas@hotelplanner.com", displayName: "Karen Caldas", role: "admin", enabled: true },
    { email: "valdemir.goncalves@hotelplanner.com", displayName: "Valdemir Goncalves", role: "admin", enabled: true },
  ],
  centers: [], matrixRules: [], audit: [], training: [],
  settings: { serverEnabled: true, maintenanceMode: false, maxQueueJobs: 100, maxConcurrentJobs: 1, queueWarningMinutes: 10, cloudflareTunnelName: "NEXUS-ZENDESK-AGENT", cloudflareTunnelId: "0dc09a1c-c395-4a4c-b501-5ec4fd855202" },
});

let writeChain = Promise.resolve();
const normalize = (v: string) => v.trim().toLowerCase();

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(DB_FILE); } catch { await fs.writeFile(DB_FILE, JSON.stringify(seed(), null, 2), "utf8"); }
}
export async function readDb(): Promise<ControlDb> { await ensureDb(); return JSON.parse(await fs.readFile(DB_FILE, "utf8")) as ControlDb; }
export async function writeDb(db: ControlDb) {
  await ensureDb();
  writeChain = writeChain.then(async () => { const tmp = DB_FILE + ".tmp"; await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8"); await fs.rename(tmp, DB_FILE); });
  await writeChain;
}
export async function getUser(email: string) { const db = await readDb(); return db.users.find(u => normalize(u.email) === normalize(email)); }
export async function canUse(email: string) {
  const db = await readDb(); const user = db.users.find(u => normalize(u.email) === normalize(email));
  if (!user?.enabled || db.settings.serverEnabled === false || db.settings.maintenanceMode === true) return false;
  if (user.centerId) { const center = db.centers.find(c => c.id === user.centerId); if (!center?.enabled) return false; }
  return true;
}
export async function requireRole(email: string, roles: Role[]) { const user = await getUser(email); if (!user?.enabled || !roles.includes(user.role)) throw new Error("FORBIDDEN"); return user; }
export function canTrain(email: string) { return TRAINERS.has(normalize(email)); }
export function isSuper(email: string) { return normalize(email) === SUPER; }
export async function saveUser(actor: string, input: Partial<User> & { email: string }) {
  await requireRole(actor, ["super_admin", "admin"]); const db = await readDb(); const idx = db.users.findIndex(u => normalize(u.email) === normalize(input.email)); const before = idx >= 0 ? db.users[idx] : undefined;
  let role = (input.role || before?.role || "agent") as Role; if (role === "super_admin" && !isSuper(actor)) throw new Error("SUPER_ONLY"); if (normalize(input.email) === SUPER) role = "super_admin";
  const user: User = { email: input.email.trim(), displayName: input.displayName || before?.displayName || "", role, centerId: input.centerId || undefined, enabled: input.enabled ?? before?.enabled ?? true };
  if (idx >= 0) db.users[idx] = user; else db.users.push(user); db.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action: "user.save", target: user.email, before, after: user }); await writeDb(db); return user;
}
export async function saveCenter(actor: string, input: Partial<Center> & { name: string }) {
  await requireRole(actor, ["super_admin", "admin"]); const db = await readDb(); const id = input.id || crypto.randomUUID(); const idx = db.centers.findIndex(c => c.id === id); const before = idx >= 0 ? db.centers[idx] : undefined;
  const center: Center = { id, name: input.name.trim(), enabled: input.enabled ?? before?.enabled ?? true, maxQueue: Number(input.maxQueue ?? before?.maxQueue ?? 50), priority: Number(input.priority ?? before?.priority ?? 0) };
  if (idx >= 0) db.centers[idx] = center; else db.centers.push(center); db.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action: "center.save", target: id, before, after: center }); await writeDb(db); return center;
}
export async function saveMatrixRule(actor: string, input: Partial<MatrixRule> & { issue: string; instructions: string }) {
  await requireRole(actor, ["super_admin", "admin"]); const db = await readDb(); const id = input.id || crypto.randomUUID(); const idx = db.matrixRules.findIndex(r => r.id === id); const before = idx >= 0 ? db.matrixRules[idx] : undefined;
  const rule: MatrixRule = { id, section: input.section || before?.section || "", issue: input.issue.trim(), instructions: input.instructions.trim(), slack: input.slack || "", refundQueue: input.refundQueue || "", createTicket: input.createTicket || "", supervisor: input.supervisor || "", vipres: input.vipres || "", enabled: input.enabled ?? before?.enabled ?? true, version: (before?.version || 0) + 1, updatedBy: actor, updatedAt: new Date().toISOString() };
  if (idx >= 0) db.matrixRules[idx] = rule; else db.matrixRules.push(rule); db.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action: "matrix.save", target: id, before, after: rule }); await writeDb(db); return rule;
}
export async function saveSetting(actor: string, key: string, value: unknown) {
  if (["serverEnabled", "maintenanceMode", "maxConcurrentJobs", "maxQueueJobs"].includes(key)) await requireRole(actor, ["super_admin"]); else await requireRole(actor, ["super_admin", "admin"]);
  const db = await readDb(); const before = db.settings[key]; db.settings[key] = value; db.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), actor, action: "setting.save", target: key, before, after: value }); await writeDb(db); return value;
}
