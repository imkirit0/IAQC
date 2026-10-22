"use server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { audit, Forbidden, guard, HOME, usernameToEmail } from "@/lib/auth";
import { authClient, db } from "@/lib/supabase";
import { getSettings, makeSnapshot } from "@/lib/data";
import { PRIORITIES, STATUSES, validateResponses, type Priority, type Responses } from "@/lib/scoring";

export type Result = { ok?: true; error?: string; data?: Record<string, unknown> };

const clean = (s: unknown, n = 500) => String(s ?? "").trim().slice(0, n);
class Invalid extends Error {}

/** Wraps an action: known validation/permission errors become user-facing messages. */
async function run(fn: () => Promise<Result | void>): Promise<Result> {
  try {
    const r = await fn();
    refresh(); // re-render the current page with the change (nothing here is cached, so no revalidation needed)
    return r ?? { ok: true };
  } catch (e) {
    if (e instanceof Invalid || e instanceof Forbidden) return { error: e.message };
    const msg = (e as Error).message ?? "";
    if (/duplicate key/i.test(msg)) return { error: "A record with this code or username already exists." };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
}
function check(cond: unknown, msg: string): asserts cond { if (!cond) throw new Invalid(msg); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ok(p: PromiseLike<{ data: any; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function bumpVersion() {
  const st = await getSettings();
  await ok(db().from("settings").upsert({ key: "checklist_version", value: st.checklist_version + 1 }));
}

// ---------- auth ----------

export async function login(_: Result | null, form: FormData): Promise<Result> {
  const username = clean(form.get("username"), 80).toLowerCase(), password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Enter your username and password." };
  const { data, error } = await (await authClient()).auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error || !data.user) {
    await audit(null, "LOGIN_FAILED", username);
    return { error: "Invalid username or password." };
  }
  const { data: p } = await db().from("profiles").select("role, active, username").eq("id", data.user.id).maybeSingle();
  if (!p?.active) {
    await (await authClient()).auth.signOut();
    return { error: "This account has been deactivated." };
  }
  await audit({ id: data.user.id, username: p.username }, "LOGIN", p.role);
  redirect(HOME[p.role as keyof typeof HOME]);
}

export async function logout() {
  await (await authClient()).auth.signOut();
  redirect("/login");
}

export async function changePassword(current: string, next: string) {
  return run(async () => {
    const me = await guard("ac", "iaqc", "cmd");
    check(next.length >= 8, "New password must be at least 8 characters.");
    const { error } = await (await authClient()).auth.signInWithPassword({ email: usernameToEmail(me.username), password: current });
    check(!error, "Current password is incorrect.");
    await ok(db().auth.admin.updateUserById(me.id, { password: next }));
    await audit(me, "PASSWORD_CHANGED", me.username);
  });
}

// ---------- settings & checklist ----------

export async function saveSettings(input: { green: number; yellow: number; P: number; N: number; weights: Record<Priority, number>; cycle: number }) {
  return run(async () => {
    const me = await guard("iaqc");
    const { green, yellow, P, N, weights, cycle } = input;
    check([green, yellow, P, N, cycle, ...PRIORITIES.map(p => weights[p])].every(Number.isFinite), "All values must be numbers.");
    check(0 < yellow && yellow < green && green <= 100, "Thresholds must satisfy 0 < Yellow < Green ≤ 100.");
    check(0 <= N && N <= P && P <= 100, "Response scoring must satisfy 0 ≤ Non-Compliant ≤ Partial ≤ 100.");
    check(PRIORITIES.every(p => weights[p] > 0) && cycle >= 1, "Weights and the visit cycle must be positive.");
    const old = await getSettings();
    const thresholds = { green, yellow }, factors = { C: 100, P, N };
    await ok(db().from("settings").upsert([
      { key: "thresholds", value: thresholds }, { key: "factors", value: factors },
      { key: "priority_weights", value: weights }, { key: "visit_cycle_days", value: Math.round(cycle) },
    ]));
    if (JSON.stringify(old.thresholds) !== JSON.stringify(thresholds) || JSON.stringify(old.factors) !== JSON.stringify(factors)) await bumpVersion();
    await audit(me, "SETTINGS_UPDATED", JSON.stringify({ thresholds, factors, weights, cycle }));
  });
}

export async function saveSection(id: number | null, input: { name: string; sort: number; active: boolean }) {
  return run(async () => {
    const me = await guard("iaqc");
    const row = { name: clean(input.name, 120), sort: Math.round(input.sort || 0), active: input.active };
    check(row.name, "Section name is required.");
    if (id) await ok(db().from("sections").update(row).eq("id", id));
    else await ok(db().from("sections").insert(row));
    await bumpVersion();
    await audit(me, id ? "SECTION_UPDATED" : "SECTION_CREATED", `${row.name} active=${row.active}`);
  });
}

export async function saveCriterion(id: number | null, input: { section_id: number; text: string; description: string; priority: Priority; weight: number; critical: boolean; mandatory: boolean; active: boolean; sort: number }) {
  return run(async () => {
    const me = await guard("iaqc");
    check(clean(input.text), "Criterion text is required.");
    check(PRIORITIES.includes(input.priority), "Choose a priority.");
    check(input.weight > 0 && input.weight <= 100, "Weight must be between 0 and 100.");
    const row = { section_id: input.section_id, text: clean(input.text, 300), description: clean(input.description, 1000), priority: input.priority, weight: input.weight,
      critical: input.critical, mandatory: input.mandatory, active: input.active, sort: Math.round(input.sort || 0) };
    if (id) await ok(db().from("criteria").update(row).eq("id", id));
    else await ok(db().from("criteria").insert(row));
    await bumpVersion();
    await audit(me, id ? "CRITERION_UPDATED" : "CRITERION_CREATED", `${row.text} [${row.priority}, w=${row.weight}, critical=${row.critical}, active=${row.active}]`);
  });
}

// ---------- centres & users ----------

export async function saveCentre(id: number | null, input: { code: string; name: string; location: string; district: string; ac_id: string | null; active: boolean }) {
  return run(async () => {
    const me = await guard("iaqc");
    const row = { code: clean(input.code, 30).toUpperCase(), name: clean(input.name, 150), location: clean(input.location, 150), district: clean(input.district, 80), ac_id: input.ac_id || null, active: input.active };
    check(row.code && row.name && row.location && row.district, "Code, name, location and district are required.");
    if (row.ac_id) {
      const { data } = await db().from("profiles").select("role").eq("id", row.ac_id).maybeSingle();
      check(data?.role === "ac", "Assigned user must be an Area Coordinator.");
    }
    if (id) await ok(db().from("centres").update(row).eq("id", id));
    else await ok(db().from("centres").insert(row));
    await audit(me, id ? "CENTRE_UPDATED" : "CENTRE_CREATED", `${row.code} ${row.name} active=${row.active}`);
  });
}

async function assignCentres(uid: string, ids?: number[]) {
  if (!ids) return;
  await ok(db().from("centres").update({ ac_id: null }).eq("ac_id", uid));
  if (ids.length) await ok(db().from("centres").update({ ac_id: uid }).in("id", ids));
}

export async function createUser(input: { username: string; name: string; area: string; password: string; centre_ids: number[] }) {
  return run(async () => {
    const me = await guard("iaqc");
    const username = clean(input.username, 60).toLowerCase();
    check(/^[a-z0-9._]+$/.test(username), "Username may contain letters, digits, '.' and '_' only.");
    check(clean(input.name), "Full name is required.");
    check(input.password.length >= 8, "Temporary password must be at least 8 characters.");
    const { data: dup } = await db().from("profiles").select("id").eq("username", username).maybeSingle();
    check(!dup, "That username is already taken.");
    const created = await ok(db().auth.admin.createUser({ email: usernameToEmail(username), password: input.password, email_confirm: true }));
    await ok(db().from("profiles").insert({ id: created.user!.id, username, name: clean(input.name, 100), role: "ac", area: clean(input.area, 100) }));
    await assignCentres(created.user!.id, input.centre_ids);
    await audit(me, "USER_CREATED", `${username} (Area Coordinator) centres=${input.centre_ids.join(",")}`);
  });
}

export async function updateUser(id: string, input: { name: string; area: string; active: boolean; centre_ids?: number[] }) {
  return run(async () => {
    const me = await guard("iaqc");
    const { data: u } = await db().from("profiles").select("username, role").eq("id", id).maybeSingle();
    check(u?.role === "ac", "Only Area Coordinator accounts can be managed here.");
    check(clean(input.name), "Full name is required.");
    await ok(db().from("profiles").update({ name: clean(input.name, 100), area: clean(input.area, 100), active: input.active }).eq("id", id));
    await assignCentres(id, input.centre_ids);
    await audit(me, "USER_UPDATED", `${u!.username} active=${input.active}`);
  });
}

export async function resetPassword(id: string, password: string) {
  return run(async () => {
    const me = await guard("iaqc");
    check(password.length >= 8, "Temporary password must be at least 8 characters.");
    const { data: u } = await db().from("profiles").select("username, role").eq("id", id).maybeSingle();
    check(u?.role === "ac", "Area Coordinator not found.");
    await ok(db().auth.admin.updateUserById(id, { password }));
    await audit(me, "PASSWORD_RESET", u!.username);
  });
}

/** IAQC sets a report's risk level by judgement (null = back to computed). Stored as a review; the report itself never changes. */
export async function setRiskLevel(assessmentId: number, input: { category: string | null; note: string }) {
  return run(async () => {
    const me = await guard("iaqc");
    check(input.category == null || ["Green", "Yellow", "Red"].includes(input.category), "Choose Green, Yellow or Red.");
    check(clean(input.note), "Give the reason for this decision.");
    const { data: a } = await db().from("assessments").select("id").eq("id", assessmentId).maybeSingle();
    check(a, "Report not found.");
    await ok(db().from("reviews").insert({ assessment_id: assessmentId, criterion_id: null, user_id: me.id, outcome: "Risk Level Set", set_category: input.category, note: clean(input.note, 2000) }));
    await audit(me, "RISK_LEVEL_SET", `assessment #${assessmentId} → ${input.category ?? "computed"}`);
  });
}

// ---------- assessments ----------

export async function submitAssessment(input: { centre_id: number; visit_date: string; responses: Responses; general_remarks: string; checklist_version: number }) {
  return run(async () => {
    const me = await guard("ac");
    const { data: c } = await db().from("centres").select("id, code, ac_id, active").eq("id", input.centre_id).maybeSingle();
    check(c && c.active && c.ac_id === me.id, "This centre is not assigned to you.");
    const vd = new Date(input.visit_date + "T00:00:00"), today = new Date(new Date().toDateString());
    check(!isNaN(+vd) && vd <= today && (+today - +vd) / 864e5 <= 60, "Visit date must be within the last 60 days and not in the future.");
    const snap = await makeSnapshot();
    check(input.checklist_version === snap.version, "The checklist was updated while you were filling it in. Reload and review your answers.");
    const errs = validateResponses(snap, input.responses ?? {});
    check(!errs.length, "Report incomplete: " + errs.slice(0, 4).join("; ") + (errs.length > 4 ? ` (+${errs.length - 4} more)` : ""));
    const ids = new Set(snap.sections.flatMap(s => s.criteria.map(x => String(x.id))));
    const responses = Object.fromEntries(Object.entries(input.responses).filter(([k]) => ids.has(k)).map(([k, v]) => [k, { status: v.status, remark: clean(v.remark, 2000) }]));
    const row = await ok(db().from("assessments").insert({
      centre_id: c!.id, ac_id: me.id, visit_date: input.visit_date, checklist_version: snap.version, snapshot: snap, responses, general_remarks: clean(input.general_remarks, 3000),
    }).select("id, submitted_at").single());
    await audit(me, "ASSESSMENT_SUBMITTED", `#${row.id} ${c!.code} visit=${input.visit_date}`);
    return { ok: true, data: { id: row.id, submitted_at: row.submitted_at, reference: `IAQC-${String(row.id).padStart(5, "0")}` } };
  });
}

export async function addReview(assessmentId: number, input: { criterion_id: number | null; outcome: string; note: string; corrected_status: string | null }) {
  return run(async () => {
    const me = await guard("iaqc");
    check(["Note", "Verified - Confirmed", "Verified - Not Substantiated", "Correction Recorded", "Resolved"].includes(input.outcome), "Choose an outcome.");
    check(clean(input.note), "A note is required.");
    check(!input.corrected_status || (STATUSES as string[]).includes(input.corrected_status), "Invalid corrected status.");
    await ok(db().from("reviews").insert({ assessment_id: assessmentId, criterion_id: input.criterion_id, user_id: me.id, outcome: input.outcome, note: clean(input.note, 2000), corrected_status: input.corrected_status || null }));
    await audit(me, "REVIEW_ADDED", `assessment #${assessmentId} criterion=${input.criterion_id ?? "-"} ${input.outcome}`);
  });
}
