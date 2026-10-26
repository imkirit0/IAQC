"use server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { audit, canRequest, Forbidden, guard, HOME, usernameToEmail, type Me } from "@/lib/auth";
import { authClient, db } from "@/lib/supabase";
import { actorsOn, getSettings, makeSnapshot, type SupportRow } from "@/lib/data";
import { ACTIONS, CATEGORIES, can, nextStatus, SR_PRIORITIES, srRef, type ActionName } from "@/lib/support";
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
    const me = await guard("ac", "iaqc", "cmd", "dept");
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

export async function saveCentre(id: number | null, input: { code: string; name: string; location: string; district: string; ac_id: string | null; active: boolean; lat: number | null; lng: number | null }) {
  return run(async () => {
    const me = await guard("iaqc");
    const row = { code: clean(input.code, 30).toUpperCase(), name: clean(input.name, 150), location: clean(input.location, 150), district: clean(input.district, 80), ac_id: input.ac_id || null, active: input.active,
      lat: input.lat ?? null, lng: input.lng ?? null };
    check(row.code && row.name && row.location && row.district, "Code, name, location and district are required.");
    check((row.lat == null) === (row.lng == null), "Enter both latitude and longitude, or neither.");
    check(row.lat == null || (Math.abs(row.lat) <= 90 && Math.abs(row.lng!) <= 180), "Latitude must be within ±90 and longitude within ±180.");
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

/** ASO Director = read-only (cmd) account scoped to one district via app_metadata. Returns its district, or null. */
async function asoDistrict(id: string): Promise<string | null> {
  const { data } = await db().auth.admin.getUserById(id);
  return (data.user?.app_metadata?.district as string) || null;
}
async function validDistrict(d: string) {
  const { data } = await db().from("centres").select("district").ilike("district", d).limit(1);
  check(data?.length, "Choose an ASO district that has centres.");
  return data![0].district as string;
}

async function validDepartment(d: string) {
  const dep = (await getSettings()).departments.find(x => x.toLowerCase() === d.trim().toLowerCase());
  check(dep, "Choose a department.");
  return dep;
}

export async function createUser(input: { username: string; name: string; area: string; password: string; centre_ids: number[]; district?: string; department?: string }) {
  return run(async () => {
    const me = await guard("iaqc");
    const username = clean(input.username, 60).toLowerCase();
    check(/^[a-z0-9._]+$/.test(username), "Username may contain letters, digits, '.' and '_' only.");
    check(clean(input.name), "Full name is required.");
    check(input.password.length >= 8, "Temporary password must be at least 8 characters.");
    const { data: dup } = await db().from("profiles").select("id").eq("username", username).maybeSingle();
    check(!dup, "That username is already taken.");
    const district = input.district ? await validDistrict(clean(input.district, 80)) : null;
    const department = input.department ? await validDepartment(input.department) : null;
    const created = await ok(db().auth.admin.createUser({ email: usernameToEmail(username), password: input.password, email_confirm: true, ...(district && { app_metadata: { district } }) }));
    const p = await db().from("profiles").insert({ id: created.user!.id, username, name: clean(input.name, 100), role: department ? "dept" : district ? "cmd" : "ac",
      area: department ? (district ? `${department}, ${district}` : department) : district ?? clean(input.area, 100), department });
    if (p.error) { await db().auth.admin.deleteUser(created.user!.id); throw new Error(p.error.message); }
    if (department) return void await audit(me, "USER_CREATED", `${username} (Department In-Charge, ${department}, ${district ?? "all districts"})`);
    if (district) return void await audit(me, "USER_CREATED", `${username} (ASO Director, ${district})`);
    await assignCentres(created.user!.id, input.centre_ids);
    await audit(me, "USER_CREATED", `${username} (Area Coordinator) centres=${input.centre_ids.join(",")}`);
  });
}

export async function updateUser(id: string, input: { name: string; area: string; active: boolean; centre_ids?: number[]; district?: string; department?: string }) {
  return run(async () => {
    const me = await guard("iaqc");
    const { data: u } = await db().from("profiles").select("username, role, department").eq("id", id).maybeSingle();
    check(clean(input.name), "Full name is required.");
    if (u?.role === "dept") {
      const department = input.department ? await validDepartment(input.department) : u.department;
      const district = input.district ? await validDistrict(clean(input.district, 80)) : null; // blank = all districts
      await ok(db().auth.admin.updateUserById(id, { app_metadata: { district } }));
      await ok(db().from("profiles").update({ name: clean(input.name, 100), area: district ? `${department}, ${district}` : department, department, active: input.active }).eq("id", id));
      return void await audit(me, "USER_UPDATED", `${u.username} department=${department} district=${district ?? "all"} active=${input.active}`);
    }
    const aso = u?.role === "cmd" && await asoDistrict(id);
    check(u?.role === "ac" || aso, "Only Area Coordinator, ASO Director and Department In-Charge accounts can be managed here.");
    let area = clean(input.area, 100);
    if (aso && input.district) {
      area = await validDistrict(clean(input.district, 80));
      await ok(db().auth.admin.updateUserById(id, { app_metadata: { district: area } }));
    } else if (aso) area = aso;
    await ok(db().from("profiles").update({ name: clean(input.name, 100), area, active: input.active }).eq("id", id));
    if (!aso) await assignCentres(id, input.centre_ids);
    await audit(me, "USER_UPDATED", `${u!.username} active=${input.active}`);
  });
}

export async function resetPassword(id: string, password: string) {
  return run(async () => {
    const me = await guard("iaqc");
    check(password.length >= 8, "Temporary password must be at least 8 characters.");
    const { data: u } = await db().from("profiles").select("username, role").eq("id", id).maybeSingle();
    check(u?.role === "ac" || u?.role === "dept" || (u?.role === "cmd" && await asoDistrict(id)), "Account not found.");
    await ok(db().auth.admin.updateUserById(id, { password }));
    await audit(me, "PASSWORD_RESET", u!.username);
  });
}

/** IAQA sets a report's risk level by judgement (null = back to computed). Stored as a review; the report itself never changes. */
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

type GpsFix = { lat: number; lng: number; accuracy: number | null; at: string };
const GPS_MAX_AGE_MS = 10 * 60e3;

export async function submitAssessment(input: { centre_id: number; visit_date: string; responses: Responses; general_remarks: string; checklist_version: number; gps: GpsFix | null; gps_reason?: string }) {
  return run(async () => {
    const me = await guard("ac");
    const { data: c } = await db().from("centres").select("id, code, ac_id, active").eq("id", input.centre_id).maybeSingle();
    check(c && c.active && c.ac_id === me.id, "This centre is not assigned to you.");
    const vd = new Date(input.visit_date + "T00:00:00"), today = new Date(new Date().toDateString());
    check(!isNaN(+vd) && vd <= today && (+today - +vd) / 864e5 <= 60, "Visit date must be within the last 60 days and not in the future.");
    // Location: verified only with a real, recent device fix; never substituted with the centre's registered point.
    const g = input.gps, st = await getSettings(), age = g ? Date.now() - Date.parse(g.at) : NaN;
    let gps: Record<string, unknown>;
    if (g) {
      check(Number.isFinite(g.lat) && Number.isFinite(g.lng) && Math.abs(g.lat) <= 90 && Math.abs(g.lng) <= 180 && (g.accuracy == null || (Number.isFinite(g.accuracy) && g.accuracy >= 0)), "The captured location is invalid. Capture it again.");
      check(age > -120e3 && age < GPS_MAX_AGE_MS, "The captured location is out of date. Capture it again.");
      gps = { gps_status: "verified", gps_lat: g.lat, gps_lng: g.lng, gps_accuracy: g.accuracy == null ? null : Math.round(g.accuracy), gps_at: new Date(g.at).toISOString(), gps_reason: null };
    } else {
      check(!st.gps_required, "Your current location is required to submit this report. Allow location access and try again.");
      check(clean(input.gps_reason), "Explain why your location could not be captured.");
      gps = { gps_status: "unavailable", gps_reason: clean(input.gps_reason, 500) };
    }
    const snap = await makeSnapshot();
    check(input.checklist_version === snap.version, "The checklist was updated while you were filling it in. Reload and review your answers.");
    const errs = validateResponses(snap, input.responses ?? {});
    check(!errs.length, "Report incomplete: " + errs.slice(0, 4).join("; ") + (errs.length > 4 ? ` (+${errs.length - 4} more)` : ""));
    const ids = new Set(snap.sections.flatMap(s => s.criteria.map(x => String(x.id))));
    const responses = Object.fromEntries(Object.entries(input.responses).filter(([k]) => ids.has(k)).map(([k, v]) => [k, { status: v.status, remark: clean(v.remark, 2000) }]));
    const row = await ok(db().from("assessments").insert({
      centre_id: c!.id, ac_id: me.id, visit_date: input.visit_date, checklist_version: snap.version, snapshot: snap, responses, general_remarks: clean(input.general_remarks, 3000), ...gps,
    }).select("id, submitted_at").single());
    await audit(me, "ASSESSMENT_SUBMITTED", `#${row.id} ${c!.code} visit=${input.visit_date} location=${gps.gps_status}`);
    return { ok: true, data: { id: row.id, submitted_at: row.submitted_at, reference: `IAQA-${String(row.id).padStart(5, "0")}` } };
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

// ---------- support requests ----------

export async function saveSupportSettings(input: { departments: string[]; verification: boolean; gps_required: boolean; gps_flag_m: number }) {
  return run(async () => {
    const me = await guard("iaqc");
    const departments = [...new Set(input.departments.map(d => clean(d, 60)).filter(Boolean))];
    check(departments.length && departments.length <= 30, "List between 1 and 30 departments.");
    check(Number.isFinite(input.gps_flag_m) && input.gps_flag_m >= 10 && input.gps_flag_m <= 100000, "Distance threshold must be between 10 and 100,000 metres.");
    const value = { departments, support_verification: !!input.verification, gps_required: !!input.gps_required, gps_flag_m: Math.round(input.gps_flag_m) };
    await ok(db().from("settings").upsert(Object.entries(value).map(([key, v]) => ({ key, value: v }))));
    await audit(me, "SETTINGS_UPDATED", JSON.stringify(value));
  });
}

async function srEvent(me: Me, id: number, actor: string, action: string, from: string | null, to: string | null, note: string, data: Record<string, unknown> | null = null) {
  await ok(db().from("support_events").insert({ request_id: id, user_id: me.id, actor, action, from_status: from, to_status: to, note, data }));
}

export async function createSupportRequest(input: { centre_id: number; assessment_id: number | null; department: string; category: string; title: string; remarks: string; priority: string; preferred_date: string }) {
  return run(async () => {
    const me = await guard("ac", "cmd");
    check(canRequest(me), "Only Area Coordinators and ASO Directors can raise support requests.");
    const { data: c } = await db().from("centres").select("id, code, ac_id, district, active").eq("id", input.centre_id).maybeSingle();
    check(c?.active && (me.role === "ac" ? c.ac_id === me.id : c.district.toLowerCase() === me.district!.toLowerCase()), "Choose one of your centres.");
    let assessment_id: number | null = null;
    if (input.assessment_id) {
      const { data: a } = await db().from("assessments").select("id, centre_id, ac_id").eq("id", input.assessment_id).maybeSingle();
      check(a && a.centre_id === c.id && (me.role !== "ac" || a.ac_id === me.id), "The linked visit report does not belong to this centre.");
      assessment_id = a.id;
    }
    const department = (await getSettings()).departments.find(d => d === input.department);
    check(department, "Choose a department.");
    check(CATEGORIES.includes(input.category), "Choose a support category.");
    check((SR_PRIORITIES as readonly string[]).includes(input.priority), "Choose a priority.");
    const title = clean(input.title, 120), remarks = clean(input.remarks, 4000), preferred_date = input.preferred_date || null;
    check(title, "Give the request a short title.");
    check(remarks.length >= 20, "Describe the support needed, why, and the expected outcome (at least 20 characters).");
    check(!preferred_date || (/^\d{4}-\d{2}-\d{2}$/.test(preferred_date) && !isNaN(Date.parse(preferred_date))), "Preferred date is invalid.");
    const row = await ok(db().from("support_requests").insert({ requester_id: me.id, centre_id: c.id, assessment_id, department, category: input.category, title, remarks, priority: input.priority, preferred_date })
      .select("id").single());
    await srEvent(me, row.id, "requester", "create", null, "Submitted", remarks, { centre: c.code, department, category: input.category, title, priority: input.priority, preferred_date, assessment_id });
    await audit(me, "SUPPORT_REQUEST_CREATED", `${srRef(row.id)} ${c.code} ${department}`);
    return { ok: true, data: { id: row.id, reference: srRef(row.id) } };
  });
}

export type SupportInput = {
  note?: string; department?: string; assignee_id?: string; response_due?: string; completion_due?: string; estimated_completion?: string;
  delivery?: { date?: string; description?: string; topic?: string; mode?: string; participants?: string; outcome?: string };
};

/** Every workflow step goes through here: the role/status rules in lib/support.ts decide, the history row records it. */
export async function supportAction(id: number, action: ActionName, input: SupportInput = {}) {
  return run(async () => {
    const me = await guard("ac", "cmd", "iaqc", "dept");
    check(Object.hasOwn(ACTIONS, action), "Unknown action.");
    const r = await ok(db().from("support_requests").select("*").eq("id", id).maybeSingle()) as SupportRow | null;
    const district = r ? (await ok(db().from("centres").select("district").eq("id", r.centre_id).single())).district as string : "";
    const actors = r ? actorsOn(me, r, district) : [];
    if (!r || !can(action, actors, r.status)) {
      await audit(me, "ACCESS_DENIED", `support ${action} on #${id}`);
      throw new Forbidden("This action is not available for this request.");
    }
    const def: { by: readonly string[]; reason?: boolean } = ACTIONS[action];
    const note = clean(input.note, 3000), st = await getSettings(), now = new Date().toISOString();
    const actor = def.by.find(a => (actors as string[]).includes(a))!;
    check(!def.reason || note, "A reason or note is required for this action.");
    const to = nextStatus(action, r.status, { resume: r.resume_status, verification: st.support_verification });
    const patch: Record<string, unknown> = { status: to };
    let data: Record<string, unknown> | null = null;
    const iso = (v: string | undefined, label: string) => { const t = v ? Date.parse(v) : NaN; check(Number.isFinite(t), `Set the ${label}.`); return new Date(t).toISOString(); };

    if (action === "assign" || action === "reassign" || action === "deadlines") {
      if (action !== "deadlines") {
        const department = st.departments.find(d => d === input.department);
        check(department, "Choose a department.");
        let assignee: string | null = null;
        if (input.assignee_id) {
          const { data: u } = await db().from("profiles").select("id, role, department, active").eq("id", input.assignee_id).maybeSingle();
          check(u?.role === "dept" && u.active && u.department === department, "Choose an active in-charge of that department.");
          const ud = await asoDistrict(u.id); // in-charges only work within their own district
          check(!ud || ud.toLowerCase() === district.toLowerCase(), "That in-charge belongs to another district.");
          assignee = u.id;
        }
        // A new assignment starts the department's response and delivery afresh.
        Object.assign(patch, { assigned_department: department, assignee_id: assignee, assigned_at: now, responded_at: null, accepted_at: null, delivered_at: null, resume_status: null });
      }
      const response_due = iso(input.response_due, "response deadline"), completion_due = input.completion_due ? iso(input.completion_due, "completion deadline") : null;
      check(action === "deadlines" || Date.parse(response_due) > Date.now(), "The response deadline must be in the future.");
      check(!completion_due || completion_due >= response_due, "The completion deadline cannot be before the response deadline.");
      Object.assign(patch, { response_due, completion_due });
      data = { department: patch.assigned_department ?? r.assigned_department, assignee_id: patch.assignee_id ?? r.assignee_id, response_due, completion_due,
        previous: { department: r.assigned_department, assignee_id: r.assignee_id, response_due: r.response_due, completion_due: r.completion_due } };
    }
    if (action === "clarify") patch.resume_status = r.status;
    if (action === "respond") patch.resume_status = null;
    if (actor === "dept" && ["accept", "reject", "clarify"].includes(action) && !r.responded_at) patch.responded_at = now;
    if (action === "accept") patch.accepted_at = now;
    if (action === "progress" && input.estimated_completion) {
      check(/^\d{4}-\d{2}-\d{2}$/.test(input.estimated_completion), "Estimated completion date is invalid.");
      patch.estimated_completion = input.estimated_completion;
      data = { estimated_completion: input.estimated_completion };
    }
    if (action === "complete") {
      const d = input.delivery ?? {}, training = r.category === "Training";
      const delivery = { date: clean(d.date, 10), description: clean(d.description, 3000), outcome: clean(d.outcome, 1000),
        ...(training && { topic: clean(d.topic, 200), mode: clean(d.mode, 40), participants: clean(d.participants, 500) }) };
      check(/^\d{4}-\d{2}-\d{2}$/.test(delivery.date) && Date.parse(delivery.date) <= Date.now(), "Enter the date the support was delivered (not in the future).");
      check(delivery.description.length >= 20, "Describe the support actually provided (at least 20 characters).");
      check(delivery.outcome, "Record the outcome.");
      check(!training || (delivery.topic && delivery.mode && delivery.participants), "For training, record the topic, delivery mode and participants.");
      Object.assign(patch, { delivery, delivered_at: now, verified_at: null, verified_by: null });
      data = delivery;
    }
    if (action === "verify") Object.assign(patch, { verified_at: now, verified_by: me.id });
    if (action === "return") patch.delivered_at = null;

    // Applies only if nobody else moved the request on in the meantime.
    const upd = await ok(db().from("support_requests").update(patch).eq("id", id).eq("status", r.status).select("id"));
    check(upd.length, "This request was just updated by someone else. Reload and try again.");
    await srEvent(me, id, actor, action, r.status, to, note, data);
    await audit(me, `SUPPORT_${action.toUpperCase()}`, `${srRef(id)} ${r.status} → ${to}`);
  });
}
