import "server-only";
import { connection } from "next/server";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "./supabase";
import { inScope, isPro, seesLocation, type Me } from "./auth";
import { asoKey, DEFAULT_DEPARTMENTS, distanceM, lateness, type Actor, type DirKind, type Spec } from "./support";
import { cleanForm, type FbForm, type FbRow } from "./feedback";
import { compute, standing, type Category, type Factors, type Priority, type Responses, type Result, type Snapshot, type Thresholds, type Alert } from "./scoring";

export type Settings = { thresholds: Thresholds; factors: Factors; priority_weights: Record<Priority, number>; visit_cycle_days: number; checklist_version: number;
  departments: string[]; asos: string[]; support_verification: boolean; gps_required: boolean; gps_flag_m: number };
export const DEFAULT_SETTINGS: Settings = {
  thresholds: { green: 85, yellow: 70 }, factors: { C: 100, P: 50, N: 0 },
  priority_weights: { Critical: 10, High: 6, Medium: 3, Low: 1 }, visit_cycle_days: 60, checklist_version: 1,
  departments: DEFAULT_DEPARTMENTS, asos: [], support_verification: true, gps_required: false, gps_flag_m: 500,
};

export type Centre = { id: number; code: string; name: string; location: string; district: string; ac_id: string | null; active: boolean; demo: boolean; lat: number | null; lng: number | null; ac_name?: string | null; last_visit?: string | null };
export type Criterion = { id: number; section_id: number; text: string; description: string; priority: Priority; weight: number; critical: boolean; mandatory: boolean; active: boolean; sort: number };
export type Section = { id: number; name: string; sort: number; active: boolean; criteria: Criterion[] };
type AssessmentRow = { id: number; centre_id: number; ac_id: string; visit_date: string; submitted_at: string; checklist_version: number; snapshot: Snapshot; responses: Responses; general_remarks: string; demo: boolean } & Gps;
export type Gps = { gps_status: "verified" | "unavailable" | null; gps_lat: number | null; gps_lng: number | null; gps_accuracy: number | null; gps_at: string | null; gps_reason: string | null };
/** Visit location as shown to IAQA / CMD: distance from the registered centre point, flagged past the configured threshold. */
export function visitLocation(a: Gps, c: { lat: number | null; lng: number | null }, flagM: number) {
  if (!a.gps_status) return null; // reports submitted before location capture existed
  const dist = a.gps_status === "verified" && c.lat != null && c.lng != null ? distanceM({ lat: a.gps_lat!, lng: a.gps_lng! }, { lat: c.lat, lng: c.lng }) : null;
  return { status: a.gps_status, lat: a.gps_lat, lng: a.gps_lng, accuracy: a.gps_accuracy, at: a.gps_at, reason: a.gps_reason, dist, flagged: dist != null && dist > flagM };
}
export type VisitLocation = NonNullable<ReturnType<typeof visitLocation>>;
export type Override = { category: "Green" | "Yellow" | "Red"; note: string; at: string; by: string };
export type Summary = Omit<Result, "items" | "thresholds" | "factors"> & { id: number; centre_id: number; ac_id: string; ac_name: string; visit_date: string; submitted_at: string; checklist_version: number; computed_category: Category; override: Override | null };
export type Review = { id: number; assessment_id: number; criterion_id: number | null; user_id: string; at: string; outcome: string; note: string; corrected_status: string | null; set_category: string | null; reviewer?: string };

const PENDING = "Reported - Pending Verification";
const CLOSED = new Set(["Verified - Not Substantiated", "Resolved"]);

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function getSettings(): Promise<Settings> {
  const rows = must(await db().from("settings").select("key, value")) as { key: keyof Settings; value: never }[];
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map(r => [r.key, r.value])) };
}

/** Area Support Offices: those IAQA added (possibly with no centres yet) plus every district already used by a centre. */
export async function getAsos(): Promise<string[]> {
  const [st, cs] = await Promise.all([getSettings(), db().from("centres").select("district")]);
  const all = [...st.asos, ...(must(cs) as { district: string }[]).map(c => c.district)];
  return [...new Map(all.map(a => [a.toLowerCase(), a])).values()].sort();
}

export async function getChecklist(includeInactive = false): Promise<Section[]> {
  let sq = db().from("sections").select("*").order("sort").order("id");
  let cq = db().from("criteria").select("*").order("sort").order("id");
  if (!includeInactive) { sq = sq.eq("active", true); cq = cq.eq("active", true); }
  const [secs, crits] = [must(await sq) as Omit<Section, "criteria">[], must(await cq) as Criterion[]];
  return secs.map(s => ({ ...s, criteria: crits.filter(c => c.section_id === s.id) }));
}

export async function makeSnapshot(): Promise<Snapshot> {
  const [st, secs] = await Promise.all([getSettings(), getChecklist()]);
  return {
    version: st.checklist_version,
    rules: { factors: st.factors, thresholds: st.thresholds },
    sections: secs.filter(s => s.criteria.length).map(s => ({
      id: s.id, name: s.name,
      criteria: s.criteria.map(({ id, text, description, priority, weight, critical, mandatory }) => ({ id, text, description, priority, weight, critical, mandatory })),
    })),
  };
}

async function profileNames(): Promise<Map<string, string>> {
  const ps = must(await db().from("profiles").select("id, name")) as { id: string; name: string }[];
  return new Map(ps.map(p => [p.id, p.name]));
}

function summarise(a: AssessmentRow, names: Map<string, string>, ovr: Map<number, Override> = new Map()): Summary {
  const { items: _i, thresholds: _t, factors: _f, ...res } = compute(a.snapshot, a.responses);
  const override = ovr.get(a.id) ?? null;
  return { ...res, category: override?.category ?? res.category, computed_category: res.category, override, id: a.id, centre_id: a.centre_id, ac_id: a.ac_id, ac_name: names.get(a.ac_id) ?? "—", visit_date: a.visit_date, submitted_at: a.submitted_at, checklist_version: a.checklist_version };
}

/** Latest verification outcome per (assessment, criterion). Alerts stay "pending" until reviewed. */
async function alertStates(ids: number[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const rs = must(await db().from("reviews").select("assessment_id, criterion_id, outcome").in("assessment_id", ids).not("criterion_id", "is", null)
    .in("outcome", ["Verified - Confirmed", "Verified - Not Substantiated", "Resolved"]).order("id")) as Review[];
  rs.forEach(r => m.set(`${r.assessment_id}:${r.criterion_id}`, r.outcome));
  return m;
}

/** IAQA's risk-level decision per report: the latest 'Risk Level Set' review wins; a null level returns to the computed one. */
async function overrides(ids: number[], names: Map<string, string>): Promise<Map<number, Override>> {
  const m = new Map<number, Override>();
  if (!ids.length) return m;
  const rs = must(await db().from("reviews").select("assessment_id, set_category, note, at, user_id").in("assessment_id", ids).eq("outcome", "Risk Level Set").order("id")) as Review[];
  rs.forEach(r => r.set_category ? m.set(r.assessment_id, { category: r.set_category as Override["category"], note: r.note, at: r.at, by: names.get(r.user_id) ?? "—" }) : m.delete(r.assessment_id));
  return m;
}

export async function getCentres(opts: { acId?: string; district?: string | null } = {}): Promise<Centre[]> {
  let q = db().from("centres").select("*").order("name");
  if (opts.acId) q = q.eq("ac_id", opts.acId).eq("active", true);
  const [cs, names, visits] = await Promise.all([q, profileNames(), db().from("assessments").select("centre_id, visit_date")]);
  const last = new Map<number, string>();
  (must(visits) as { centre_id: number; visit_date: string }[]).forEach(v => { if (v.visit_date > (last.get(v.centre_id) ?? "")) last.set(v.centre_id, v.visit_date); });
  return (must(cs) as Centre[]).filter(c => !opts.district || c.district.toLowerCase() === opts.district.toLowerCase()).map(c => ({ ...c, ac_name: c.ac_id ? names.get(c.ac_id) ?? null : null, last_visit: last.get(c.id) ?? null }));
}

/** Each centre's current status: the band of its average score across all visits, IAQA's risk-level decision on the latest report included. Centres with no report are absent. */
export async function getCentreStatuses(centreIds: number[]): Promise<Record<number, Category>> {
  if (!centreIds.length) return {};
  const [rows, st] = await Promise.all([db().from("assessments").select("*").in("centre_id", centreIds).order("visit_date").order("id"), getSettings()]);
  const names = new Map<string, string>(), by = new Map<number, AssessmentRow[]>(); // names are not shown here
  (must(rows) as AssessmentRow[]).forEach(a => by.set(a.centre_id, [...(by.get(a.centre_id) ?? []), a]));
  const ovr = await overrides([...by.values()].map(v => v.at(-1)!.id), names);
  return Object.fromEntries([...by].map(([id, v]) => [id, standing(v.map(a => summarise(a, names, ovr)), st.thresholds).category]));
}

export type RankRow = Centre & {
  rank: number; assessment_id: number | null; score: number | null; risk: number | null; category: Category; override: Override | null; reported_by: string | null;
  alerts: (Alert & { verification: string })[]; sections: Summary["sections"]; counts: Summary["counts"] | null;
  trend: number | null; due: boolean; days_since: number | null; history: { id: number; visit_date: string; score: number | null; category: Category }[];
};

export async function getRanking(from?: string, to?: string, district?: string | null): Promise<{ centres: RankRow[]; settings: Settings }> {
  const [settings, centres, names] = await Promise.all([getSettings(), getCentres({ district }), profileNames()]);
  let aq = db().from("assessments").select("*").order("visit_date").order("id");
  if (from) aq = aq.gte("visit_date", from);
  if (to) aq = aq.lte("visit_date", to);
  const all = must(await aq) as AssessmentRow[];
  const [states, ovr] = await Promise.all([alertStates(all.map(a => a.id)), overrides(all.map(a => a.id), names)]);
  await connection(); // "visit due" depends on the current time: always computed per request
  const today = Date.now();
  const rows: Omit<RankRow, "rank">[] = centres.filter(c => c.active).map(c => {
    const hs = all.filter(a => a.centre_id === c.id).map(a => summarise(a, names, ovr));
    const latest = hs.at(-1), prev = hs.at(-2);
    const history = hs.map(h => ({ id: h.id, visit_date: h.visit_date, score: h.score, category: h.category }));
    if (!latest) return { ...c, assessment_id: null, score: null, risk: null, category: "Not Assessed", reported_by: null, alerts: [], sections: [], counts: null, trend: null, due: true, days_since: null, history, override: null };
    const alerts = latest.alerts.map(al => ({ ...al, verification: states.get(`${latest.id}:${al.criterion_id}`) ?? PENDING })).filter(al => !CLOSED.has(al.verification));
    const days_since = Math.floor((today - Date.parse(latest.visit_date)) / 864e5);
    return {
      ...c, assessment_id: latest.id, ...standing(hs, settings.thresholds), override: latest.override, reported_by: latest.ac_name, // score = average of the visits in range
      alerts, sections: latest.sections, counts: latest.counts, history,
      trend: prev?.score != null && latest.score != null ? Math.round((latest.score - prev.score) * 100) / 100 : null,
      days_since, due: days_since > settings.visit_cycle_days,
    };
  });
  const order: Record<string, number> = { Red: 0, Yellow: 1, Green: 2, Unscorable: 3, "Not Assessed": 4 };
  rows.sort((a, b) => (a.alerts.length ? 0 : 1) - (b.alerts.length ? 0 : 1) || (order[a.category] ?? 5) - (order[b.category] ?? 5) || (a.score ?? 999) - (b.score ?? 999) || a.name.localeCompare(b.name));
  return { centres: rows.map((r, i) => ({ ...r, rank: i + 1 })), settings };
}

export async function listAssessments(district?: string | null) {
  const [rows, centres, names, st] = await Promise.all([db().from("assessments").select("*").order("visit_date", { ascending: false }).order("id", { ascending: false }), getCentres({ district }), profileNames(), getSettings()]);
  const byId = new Map(centres.map(c => [c.id, c])), list = (must(rows) as AssessmentRow[]).filter(a => byId.has(a.centre_id));
  const ovr = await overrides(list.map(a => a.id), names);
  return list.map(a => {
    const c = byId.get(a.centre_id)!;
    return { ...summarise(a, names, ovr), centre_name: c.name, code: c.code, district: c.district, location: visitLocation(a, c, st.gps_flag_m) };
  });
}

export type AssessmentDetail = Omit<Result & Summary, "alerts"> & { general_remarks: string; reviews: Review[]; alerts: (Alert & { verification: string })[]; gps: Gps };

export async function getAssessment(id: number): Promise<AssessmentDetail | null> {
  const a = must(await db().from("assessments").select("*").eq("id", id).maybeSingle()) as AssessmentRow | null;
  if (!a) return null;
  const names = await profileNames();
  const full = compute(a.snapshot, a.responses);
  const reviews = (must(await db().from("reviews").select("*").eq("assessment_id", id).order("id")) as Review[]).map(r => ({ ...r, reviewer: names.get(r.user_id) ?? "—" }));
  const [states, ovr] = await Promise.all([alertStates([id]), overrides([id], names)]);
  const sum = summarise(a, names, ovr);
  return {
    ...full, ...sum, general_remarks: a.general_remarks, reviews,
    gps: { gps_status: a.gps_status, gps_lat: a.gps_lat, gps_lng: a.gps_lng, gps_accuracy: a.gps_accuracy, gps_at: a.gps_at, gps_reason: a.gps_reason },
    alerts: full.alerts.map(al => ({ ...al, verification: states.get(`${id}:${al.criterion_id}`) ?? PENDING })),
  };
}

export async function getScorecard(centreId: number) {
  const c = must(await db().from("centres").select("*").eq("id", centreId).maybeSingle()) as Centre | null;
  if (!c) return null;
  const [names, { thresholds }] = await Promise.all([profileNames(), getSettings()]);
  const rows = must(await db().from("assessments").select("*").eq("centre_id", centreId).order("visit_date").order("id")) as AssessmentRow[];
  const [states, ovr] = await Promise.all([alertStates(rows.map(a => a.id)), overrides(rows.map(a => a.id), names)]);
  const history = rows.map(a => summarise(a, names, ovr));
  const unresolved = history.flatMap(h => h.alerts.map(al => ({ ...al, assessment_id: h.id, visit_date: h.visit_date, verification: states.get(`${h.id}:${al.criterion_id}`) ?? PENDING })))
    .filter(u => !CLOSED.has(u.verification));
  // Criteria non-compliant in an earlier visit and still non-compliant in the latest one.
  const recurring: { text: string; section: string; first_reported: string; times: number }[] = [];
  if (rows.length > 1) {
    const latest = rows.at(-1)!, earlier = new Map<string, string[]>();
    rows.slice(0, -1).forEach(a => Object.entries(a.responses).forEach(([k, v]) => { if (v.status === "N") earlier.set(k, [...(earlier.get(k) ?? []), a.visit_date]); }));
    latest.snapshot.sections.forEach(s => s.criteria.forEach(cr => {
      const prior = earlier.get(String(cr.id));
      if (prior && latest.responses[String(cr.id)]?.status === "N") recurring.push({ text: cr.text, section: s.name, first_reported: prior[0], times: prior.length + 1 });
    }));
  }
  return { centre: { ...c, ac_name: c.ac_id ? names.get(c.ac_id) ?? null : null }, history, unresolved, recurring, overall: standing(history, thresholds), thresholds };
}

export async function getUsers() {
  const [ps, cs, au] = await Promise.all([db().from("profiles").select("id, username, name, role, area, active, created_at, department, phone, email").order("role").order("name"), db().from("centres").select("id, code, name, ac_id"),
    db().auth.admin.listUsers({ perPage: 1000 })]); // ponytail: single page of auth users; paginate past 1000 accounts
  const centres = must(cs) as { id: number; code: string; name: string; ac_id: string | null }[];
  const district = new Map(au.data.users.map(u => [u.id, (u.app_metadata?.district as string) || null]));
  return (must(ps) as { id: string; username: string; name: string; role: "ac" | "iaqc" | "cmd" | "dept"; area: string; active: boolean; created_at: string; department: string | null; phone: string | null; email: string | null }[])
    .map(u => ({ ...u, district: district.get(u.id) ?? null, centres: centres.filter(c => c.ac_id === u.id) }));
}

export const AUDIT_PAGE_SIZE = 50;

export async function getAudit(page = 1) {
  const from = (page - 1) * AUDIT_PAGE_SIZE;
  const r = await db().from("audit_log").select("*", { count: "exact" }).order("id", { ascending: false }).range(from, from + AUDIT_PAGE_SIZE - 1);
  return { log: must(r) as { id: number; at: string; username: string | null; action: string; detail: string }[], total: r.count ?? 0 };
}

// ---------- support requests ----------

export type SupportRow = {
  id: number; requester_id: string; centre_id: number; assessment_id: number | null; department: string; category: string; title: string; remarks: string;
  priority: string; preferred_date: string | null; status: string; resume_status: string | null; assigned_department: string | null; assignee_id: string | null;
  assigned_at: string | null; response_due: string | null; completion_due: string | null; responded_at: string | null; accepted_at: string | null;
  estimated_completion: string | null; delivered_at: string | null; delivery: Record<string, string> | null; verified_at: string | null; verified_by: string | null;
  created_at: string; updated_at: string;
};
export type SupportEvent = { id: number; request_id: number; at: string; user_id: string | null; actor: string; action: string; from_status: string | null; to_status: string | null; note: string; data: Record<string, unknown> | null; by?: string;
  gps_lat: number | null; gps_lng: number | null; gps_accuracy: number | null; gps_at: string | null; gps_reason: string | null };
export type SupportItem = SupportRow & ReturnType<typeof lateness> & { requester: string; requester_role: string; assignee: string | null; centre_name: string; centre_code: string; district: string; reassigned: number };

/** What this user may do on a request: requester of their own, IAQA everywhere, a department in-charge on its department's requests
 *  for centres in its district (an in-charge without a district covers all districts). `district` is the request's centre district. */
export function actorsOn(me: Me, r: Pick<SupportRow, "requester_id" | "assigned_department" | "assignee_id">, district: string): Actor[] {
  const a: Actor[] = [];
  if (r.requester_id === me.id) a.push("requester");
  if (me.role === "iaqc") a.push("iaqc");
  if (me.role === "dept" && inScope(me, district) && (r.assignee_id === me.id || (!!me.department && r.assigned_department === me.department))) a.push("dept");
  return a;
}
/** IAQA and CMD monitor every request, ASO Directors those for their district's centres; everyone else only those they act on. */
export const canSeeRequest = (me: Me, r: SupportItem) => me.role === "iaqc" || (me.role === "cmd" && inScope(me, r.district)) || actorsOn(me, r, r.district).length > 0;

async function enrich(rows: SupportRow[], reassigns: Map<number, number> = new Map()): Promise<SupportItem[]> {
  const [ps, cs] = await Promise.all([db().from("profiles").select("id, name, role"), db().from("centres").select("id, name, code, district")]);
  const people = new Map((must(ps) as { id: string; name: string; role: string }[]).map(p => [p.id, p]));
  const centres = new Map((must(cs) as { id: number; name: string; code: string; district: string }[]).map(c => [c.id, c]));
  await connection(); // overdue depends on the current time
  const now = Date.now();
  return rows.map(r => {
    const p = people.get(r.requester_id), c = centres.get(r.centre_id);
    return { ...r, ...lateness(r, now), requester: p?.name ?? "—", requester_role: p?.role === "ac" ? "Area Coordinator" : "ASO Director",
      assignee: r.assignee_id ? people.get(r.assignee_id)?.name ?? "—" : null, centre_name: c?.name ?? "—", centre_code: c?.code ?? "", district: c?.district ?? "", reassigned: reassigns.get(r.id) ?? 0 };
  });
}

// ponytail: loads every request and filters in code; move the visibility filter into the query past a few thousand requests.
export async function getSupportRequests(me: Me): Promise<SupportItem[]> {
  const [rs, ev] = await Promise.all([db().from("support_requests").select("*").order("id", { ascending: false }), db().from("support_events").select("request_id").eq("action", "reassign")]);
  const reassigns = new Map<number, number>();
  (must(ev) as { request_id: number }[]).forEach(e => reassigns.set(e.request_id, (reassigns.get(e.request_id) ?? 0) + 1));
  return (await enrich(must(rs) as SupportRow[], reassigns)).filter(r => canSeeRequest(me, r));
}

/** Null when it does not exist or this user may not see it (no difference shown, so IDs cannot be probed). */
export async function getSupportRequest(me: Me, id: number) {
  const r = must(await db().from("support_requests").select("*").eq("id", id).maybeSingle()) as SupportRow | null;
  if (!r) return null;
  const [names, ev] = await Promise.all([profileNames(), db().from("support_events").select("*").eq("request_id", id).order("id")]);
  const hide = seesLocation(me) ? {} : { gps_lat: null, gps_lng: null, gps_accuracy: null, gps_at: null, gps_reason: null };
  const events = (must(ev) as SupportEvent[]).map(e => ({ ...e, ...hide, by: e.user_id ? names.get(e.user_id) ?? "—" : "System" }));
  const [item] = await enrich([r], new Map([[id, events.filter(e => e.action === "reassign").length]]));
  if (!canSeeRequest(me, item)) return null;
  return { ...item, events, actors: actorsOn(me, r, item.district), names };
}

/** In-charges who may take a request for a centre in `district`: those of that district plus any covering all districts. */
export async function getDeptUsers(district: string) {
  const [ps, au] = await Promise.all([db().from("profiles").select("id, name, department").eq("role", "dept").eq("active", true).order("name"),
    db().auth.admin.listUsers({ perPage: 1000 })]); // ponytail: single page of auth users, as in getUsers
  const d = new Map(au.data.users.map(u => [u.id, (u.app_metadata?.district as string) || null]));
  return (must(ps) as { id: string; name: string; department: string | null }[])
    .map(u => ({ ...u, district: d.get(u.id) ?? null })).filter(u => !u.district || u.district.toLowerCase() === district.toLowerCase());
}

/** Requests waiting on this user: the masthead count is the in-app notification. Monitoring (CMD) counts overdue ones. */
export async function supportInbox(me: Me) {
  const rs = await getSupportRequests(me);
  const n = (f: (r: SupportItem) => boolean) => rs.filter(f).length;
  if (me.role === "iaqc") return n(r => ["Submitted", "Under Review", "Rejected", "Completed - Awaiting Verification"].includes(r.status) || r.overdue);
  if (me.role === "dept") return n(r => r.status === "Assigned" || r.overdue);
  if (me.role === "cmd" && !me.district) return n(r => r.overdue);
  return n(r => r.requester_id === me.id && r.status === "Awaiting Clarification");
}

// ---------- contact directories ----------

/** qualification, division, gctid and centre_ids are used by trainers only. */
export type DirEntry = { id: number; kind: DirKind; name: string; phone: string; email: string; district: string | null; notes: string; updated_at: string;
  qualification: string; division: string; gctid: string; centre_ids: number[] };
export type Infra = { id: number; centre_id: number; name: string; specs: Spec[]; updated_at: string };
/** mine = this user may attach trainers and infrastructure to the centre (IAQA: any; an Area Coordinator: their own). */
export type CentreLite = { id: number; code: string; name: string; district: string; mine: boolean };
export type DirChange = Omit<DirEntry, "id" | "updated_at"> & { id: number; entry_id: number | null; status: "Pending" | "Verified" | "Rejected"; submitted_by: string; submitted_at: string;
  reviewed_by: string | null; reviewed_at: string | null; remark: string; by?: string; reviewer?: string };

/** Districts of an Area Coordinator's active centres: the ones whose Directory entries they may propose. */
export async function acDistricts(acId: string) {
  const cs = must(await db().from("centres").select("district").eq("ac_id", acId).eq("active", true)) as { district: string }[];
  return [...new Set(cs.map(c => c.district))].sort();
}

/** Verified entries for all districts plus the viewer's own: an AC's are those of their centres, district accounts their district.
 *  IAQA also gets submissions to verify, an Area Coordinator their own submissions. */
export async function getDirectory(me: Me) {
  const changes = me.role === "iaqc" || me.role === "ac"
    ? (me.role === "ac" ? db().from("directory_changes").select("*").eq("submitted_by", me.id) : db().from("directory_changes").select("*")).neq("kind", "pro").order("id", { ascending: false }).limit(300)
    : null; // ponytail: latest 300 submissions; page them if IAQA needs the older history on screen (audit log keeps it all)
  // ponytail: loads every infrastructure entry and filters by centre in code; filter in the query past a few thousand entries
  const [rs, cs, ch, names, inf] = await Promise.all([db().from("directory").select("*").neq("kind", "pro").order("name"), db().from("centres").select("id, code, name, district, ac_id").eq("active", true).order("name"), changes, profileNames(),
    db().from("infrastructure").select("*").order("name")]);
  const centres = must(cs) as { id: number; code: string; name: string; district: string; ac_id: string | null }[];
  const own = me.role === "ac" ? [...new Set(centres.filter(c => c.ac_id === me.id).map(c => c.district))].sort() : null;
  const mine = own ? new Set(own.map(d => d.toLowerCase())) : me.district ? new Set([me.district.toLowerCase()]) : null;
  const entries = (must(rs) as DirEntry[]).filter(e => !mine || !e.district || mine.has(e.district.toLowerCase()));
  const submissions = ch ? (must(ch) as DirChange[]).map(c => ({ ...c, by: names.get(c.submitted_by) ?? "—", reviewer: c.reviewed_by ? names.get(c.reviewed_by) ?? "—" : undefined })) : [];
  // Centres whose infrastructure this user sees: an AC's own, a district account's district, everything for IAQA and head office.
  const vis = new Set(centres.filter(c => (me.role === "ac" ? c.ac_id === me.id : inScope(me, c.district))).map(c => c.id));
  const named = new Set([...entries, ...submissions].flatMap(e => e.centre_ids)); // other centres are sent only to name a listed trainer's centres
  return { entries, submissions, districts: own ?? [...new Set(centres.map(c => c.district))].sort(),
    centres: centres.filter(c => vis.has(c.id) || named.has(c.id)).map((c): CentreLite => ({ id: c.id, code: c.code, name: c.name, district: c.district, mine: vis.has(c.id) })),
    infra: (must(inf) as Infra[]).filter(i => vis.has(i.centre_id)) };
}

// ---------- a centre's Directory records at assessment ----------

export type Check = { subject: "infrastructure" | "trainer"; subject_id: number; label: string; outcome: "Verified" | "Discrepancy"; note: string; at: string; by: string };
export type CentreRecords = { infra: Infra[]; trainers: (Pick<DirEntry, "id" | "name" | "phone" | "email" | "notes" | "qualification" | "division" | "gctid"> & { centres: string[] })[] };

/** The infrastructure and trainers listed for one centre, as the Directory holds them now. */
export async function getCentreRecords(centreId: number): Promise<CentreRecords> {
  const [inf, tr, cs] = await Promise.all([db().from("infrastructure").select("*").eq("centre_id", centreId).order("name"),
    db().from("directory").select("*").eq("kind", "trainer").contains("centre_ids", [centreId]).order("name"), db().from("centres").select("id, code, name")]);
  const names = new Map((must(cs) as { id: number; code: string; name: string }[]).map(c => [c.id, `${c.code} ${c.name}`]));
  return { infra: must(inf) as Infra[], trainers: (must(tr) as DirEntry[]).map(t => ({ id: t.id, name: t.name, phone: t.phone, email: t.email, notes: t.notes, qualification: t.qualification, division: t.division, gctid: t.gctid,
    centres: t.centre_ids.flatMap(i => names.get(i) ?? []) })) };
}

/** IAQA's verification per item for one assessment, keyed "subject:id". The latest entry for an item wins. */
export async function getChecks(assessmentId: number): Promise<Record<string, Check>> {
  const [rs, names] = await Promise.all([db().from("directory_checks").select("*").eq("assessment_id", assessmentId).order("id"), profileNames()]);
  return Object.fromEntries((must(rs) as (Omit<Check, "by"> & { user_id: string })[]).map(({ user_id, ...c }) => [`${c.subject}:${c.subject_id}`, { ...c, by: names.get(user_id) ?? "—" }]));
}

// ---------- reference data ----------

export type RefVersion = { id: number; item_id: number; title: string; content: string; file_name: string | null; updated_at: string; by: string; sheet: boolean };
/** An item as shown: its latest version, with the earlier ones (newest first) as history. */
export type RefItem = RefVersion & { category_id: number; history: RefVersion[] };
export type RefCategory = { id: number; name: string };

/** Everything in the library, for every signed-in user. Most recently updated items first. */
// ponytail: loads every version of every item; fetch history on demand once the library runs to thousands of updates
export async function getReference(): Promise<{ categories: RefCategory[]; items: RefItem[] }> {
  const [cs, is, vs, names] = await Promise.all([db().from("reference_categories").select("id, name").order("name"), db().from("reference_items").select("id, category_id"),
    db().from("reference_versions").select("id, item_id, title, content, file_name, updated_at, updated_by, sheet_columns").order("id", { ascending: false }), profileNames()]);
  const versions = (must(vs) as (Omit<RefVersion, "by" | "sheet"> & { updated_by: string; sheet_columns: string[] | null })[]).map(({ updated_by, sheet_columns, ...v }) => ({ ...v, sheet: !!sheet_columns, by: names.get(updated_by) ?? "—" }));
  const items = (must(is) as { id: number; category_id: number }[]).flatMap(i => {
    const [latest, ...history] = versions.filter(v => v.item_id === i.id);
    return latest ? [{ ...latest, category_id: i.category_id, history }] : [];
  }).sort((a, b) => b.id - a.id);
  return { categories: must(cs) as RefCategory[], items };
}

export type RefSheet = { columns: string[]; rows: { n: number; aso: string; cells: string[] }[] };

/** The ASOs whose spreadsheet rows this user may read, or null for all: an Area Coordinator's are those of their centres,
 *  a district account's its district. An Area Coordinator with no centres gets an empty list, so no rows. */
export async function refScope(me: Me): Promise<string[] | null> {
  if (me.role === "ac") return acDistricts(me.id);
  return me.district ? [me.district] : null;
}

/** One version's table, holding only the rows this user may read: the database query itself is limited to the user's ASOs. Null when the version has no table. */
export async function getRefSheet(me: Me, versionId: number): Promise<RefSheet | null> {
  const v = must(await db().from("reference_versions").select("file_path, sheet_columns").eq("id", versionId).maybeSingle()) as { file_path: string | null; sheet_columns: string[] | null } | null;
  if (!v?.file_path || !v.sheet_columns) return null;
  const scope = await refScope(me);
  if (scope && !scope.length) return { columns: v.sheet_columns, rows: [] };
  const q = db().from("reference_sheet_rows").select("aso, rows").eq("file_path", v.file_path);
  const parts = must(await (scope ? q.in("aso_key", scope.map(asoKey)) : q)) as { aso: string; rows: { n: number; cells: string[] }[] }[];
  return { columns: v.sheet_columns, rows: parts.flatMap(p => p.rows.map(r => ({ ...r, aso: p.aso }))).sort((a, b) => a.n - b.n) };
}

// ---------- student feedback ----------

const ticketSign = (body: string) => createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(`feedback-ticket:${body}`).digest("base64url");
/** Issued each time the form is opened. A submission needs a genuine ticket old enough for a person to have filled the form, and each ticket counts once. */
export function feedbackTicket() {
  const body = `${Date.now()}.${randomUUID()}`;
  return `${body}.${ticketSign(body)}`;
}
/** How long ago the ticket was issued, in ms, or null if it is not one of ours. */
export function ticketAge(ticket: string): number | null {
  const at = ticket.lastIndexOf(".");
  if (at < 1) return null;
  const a = Buffer.from(ticket.slice(at + 1)), b = Buffer.from(ticketSign(ticket.slice(0, at)));
  return a.length === b.length && timingSafeEqual(a, b) ? Date.now() - Number(ticket.split(".")[0]) : null;
}
export const hashIp = (ip: string) => createHmac("sha256", process.env.SUPABASE_SECRET_KEY!).update(`feedback-ip:${ip}`).digest("base64url");

export type FbFormRow = { draft: unknown; version: number | null; active: boolean; updated_at: string };

export async function getFeedbackForm() {
  const f = must(await db().from("feedback_form").select("draft, version, active, updated_at").eq("id", 1).single()) as FbFormRow;
  const v = f.version == null ? null : must(await db().from("feedback_versions").select("form, published_at").eq("version", f.version).single()) as { form: FbForm; published_at: string };
  return { draft: cleanForm(f.draft), version: f.version, active: f.active, updated_at: f.updated_at, published: v ? cleanForm(v.form) : null, published_at: v?.published_at ?? null };
}

/** All a student's browser ever receives: the current questions, or null while collection is closed. */
export async function getPublicFeedback() {
  const f = await getFeedbackForm();
  return f.active && f.published ? { version: f.version!, form: f.published } : null;
}

export type FbFilter = { status?: string; from?: string; to?: string; q?: string };
const isDay = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
const RESPONSE_COLUMNS = "id, version, answers, submitted_at, status, verified_at";

/** The responses query with the filters applied. Dates are whole days in India time, as displayed. */
function feedbackQuery(f: FbFilter, count?: "exact") {
  let q = db().from("feedback_responses").select(RESPONSE_COLUMNS, count ? { count } : undefined);
  if (f.status === "Pending Verification" || f.status === "Verified") q = q.eq("status", f.status);
  if (isDay(f.from)) q = q.gte("submitted_at", `${f.from}T00:00:00+05:30`);
  if (isDay(f.to)) q = q.lte("submitted_at", `${f.to}T23:59:59.999+05:30`);
  const s = f.q?.trim();
  if (s) q = q.ilike("search_text", `%${s.replace(/[\\%_]/g, "\\$&")}%`);
  return q.order("id", { ascending: false });
}

export const FEEDBACK_PAGE_SIZE = 50;
export async function listFeedback(f: FbFilter, page: number) {
  const from = (page - 1) * FEEDBACK_PAGE_SIZE;
  const r = await feedbackQuery(f, "exact").range(from, from + FEEDBACK_PAGE_SIZE - 1);
  return { rows: must(r) as unknown as FbRow[], matched: r.count ?? 0 };
}

/** Every matching response, fetched a page at a time because the database returns at most 1000 rows per request. */
// ponytail: holds them all in memory for statistics and export; aggregate in SQL past tens of thousands of responses
export async function allFeedback(f: FbFilter) {
  const rows: FbRow[] = [];
  for (let at = 0; ; at += 1000) {
    const page = must(await feedbackQuery(f).range(at, at + 999)) as unknown as FbRow[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function feedbackCounts() {
  const n = async (status?: string) => {
    let q = db().from("feedback_responses").select("id", { count: "exact", head: true });
    if (status) q = q.eq("status", status);
    return (await q).count ?? 0;
  };
  const [total, pending, verified] = await Promise.all([n(), n("Pending Verification"), n("Verified")]);
  return { total, pending, verified };
}

export async function feedbackVersions() {
  const rows = must(await db().from("feedback_versions").select("version, form")) as { version: number; form: FbForm }[];
  return new Map(rows.map(r => [r.version, r.form]));
}

/** One response with the questions exactly as they stood when the student answered. */
export async function getFeedbackResponse(id: number) {
  const r = must(await db().from("feedback_responses").select(`${RESPONSE_COLUMNS}, verified_by`).eq("id", id).maybeSingle()) as unknown as (FbRow & { verified_by: string | null }) | null;
  if (!r) return null;
  const [v, names] = await Promise.all([db().from("feedback_versions").select("form, published_at").eq("version", r.version).single(), profileNames()]);
  return { ...r, form: (must(v) as { form: FbForm }).form, verifier: r.verified_by ? names.get(r.verified_by) ?? "—" : null };
}

// ---------- information sharing (PRO <-> Area Coordinator) ----------

export type Share = { id: number; sender_id: string; recipient_id: string; subject: string; remarks: string; sent_at: string; accepted_at: string | null; reply: string;
  from: string; from_role: string; to: string; to_role: string };

async function people() {
  const ps = must(await db().from("profiles").select("id, name, role, department, active").order("name")) as { id: string; name: string; role: string; department: string | null; active: boolean }[];
  return ps.map(p => ({ ...p, pro: isPro(p as Pick<Me, "role" | "department">) }));
}
const roleName = (p?: { role: string; pro: boolean }) => (!p ? "" : p.pro ? "PRO" : p.role === "ac" ? "Area Coordinator" : "");

/** The whole history, newest first: every signed-in user may read it. */
// ponytail: loads every item; add server-side paging once the history runs to thousands
export async function getShares(): Promise<Share[]> {
  const [rs, ps] = await Promise.all([db().from("info_shares").select("*").order("id", { ascending: false }), people()]);
  const by = new Map(ps.map(p => [p.id, p]));
  return (must(rs) as Omit<Share, "from" | "from_role" | "to" | "to_role">[]).map(r => ({ ...r,
    from: by.get(r.sender_id)?.name ?? "—", from_role: roleName(by.get(r.sender_id)), to: by.get(r.recipient_id)?.name ?? "—", to_role: roleName(by.get(r.recipient_id)) }));
}

/** (acId, proId) => whether they share a district: one of the AC's active centres is in the PRO's district. A PRO without a district (head office) covers all. */
export async function sameRegion() {
  const [cs, au] = await Promise.all([db().from("centres").select("district, ac_id").eq("active", true),
    db().auth.admin.listUsers({ perPage: 1000 })]); // ponytail: single page of auth users, as in getUsers
  const acs = new Map<string, Set<string>>();
  (must(cs) as { district: string; ac_id: string | null }[]).forEach(c => { if (c.ac_id) acs.set(c.ac_id, (acs.get(c.ac_id) ?? new Set()).add(c.district.toLowerCase())); });
  const district = new Map(au.data.users.map(u => [u.id, ((u.app_metadata?.district as string) || "").toLowerCase()]));
  return (acId: string, proId: string) => { const d = district.get(proId); return !d || !!acs.get(acId)?.has(d); };
}

/** Who this user may send to: PROs to Area Coordinators of their district and back. Empty for everyone else (read-only). */
export async function shareRecipients(me: Me) {
  if (me.role !== "ac" && !isPro(me)) return [];
  const [ps, same] = await Promise.all([people(), sameRegion()]);
  return ps.filter(p => p.active && p.id !== me.id && (me.role === "ac" ? p.pro && same(me.id, p.id) : p.role === "ac" && same(p.id, me.id))).map(p => ({ id: p.id, name: p.name }));
}

/** Items waiting for this user's acceptance: the count on the Information sharing tab. */
export async function sharingInbox(me: Me) {
  const { count } = await db().from("info_shares").select("id", { count: "exact", head: true }).eq("recipient_id", me.id).is("accepted_at", null);
  return count ?? 0;
}
