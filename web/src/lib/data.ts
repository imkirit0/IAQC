import "server-only";
import { connection } from "next/server";
import { db } from "./supabase";
import { compute, type Category, type Factors, type Priority, type Responses, type Result, type Snapshot, type Thresholds, type Alert } from "./scoring";

export type Settings = { thresholds: Thresholds; factors: Factors; priority_weights: Record<Priority, number>; visit_cycle_days: number; checklist_version: number };
export const DEFAULT_SETTINGS: Settings = {
  thresholds: { green: 85, yellow: 70 }, factors: { C: 100, P: 50, N: 0 },
  priority_weights: { Critical: 10, High: 6, Medium: 3, Low: 1 }, visit_cycle_days: 60, checklist_version: 1,
};

export type Centre = { id: number; code: string; name: string; location: string; district: string; ac_id: string | null; active: boolean; demo: boolean; ac_name?: string | null; last_visit?: string | null };
export type Criterion = { id: number; section_id: number; text: string; description: string; priority: Priority; weight: number; critical: boolean; mandatory: boolean; active: boolean; sort: number };
export type Section = { id: number; name: string; sort: number; active: boolean; criteria: Criterion[] };
type AssessmentRow = { id: number; centre_id: number; ac_id: string; visit_date: string; submitted_at: string; checklist_version: number; snapshot: Snapshot; responses: Responses; general_remarks: string; demo: boolean };
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
      ...c, assessment_id: latest.id, score: latest.score, risk: latest.risk, category: latest.category, override: latest.override, reported_by: latest.ac_name,
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
  const [rows, centres, names] = await Promise.all([db().from("assessments").select("*").order("visit_date", { ascending: false }).order("id", { ascending: false }), getCentres({ district }), profileNames()]);
  const byId = new Map(centres.map(c => [c.id, c])), list = (must(rows) as AssessmentRow[]).filter(a => byId.has(a.centre_id));
  const ovr = await overrides(list.map(a => a.id), names);
  return list.map(a => {
    const c = byId.get(a.centre_id)!;
    return { ...summarise(a, names, ovr), centre_name: c.name, code: c.code, district: c.district };
  });
}

export type AssessmentDetail = Omit<Result & Summary, "alerts"> & { general_remarks: string; reviews: Review[]; alerts: (Alert & { verification: string })[] };

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
    alerts: full.alerts.map(al => ({ ...al, verification: states.get(`${id}:${al.criterion_id}`) ?? PENDING })),
  };
}

export async function getScorecard(centreId: number) {
  const c = must(await db().from("centres").select("*").eq("id", centreId).maybeSingle()) as Centre | null;
  if (!c) return null;
  const names = await profileNames();
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
  return { centre: { ...c, ac_name: c.ac_id ? names.get(c.ac_id) ?? null : null }, history, unresolved, recurring };
}

export async function getUsers() {
  const [ps, cs] = await Promise.all([db().from("profiles").select("id, username, name, role, area, active, created_at").order("role").order("name"), db().from("centres").select("id, code, name, ac_id")]);
  const centres = must(cs) as { id: number; code: string; name: string; ac_id: string | null }[];
  return (must(ps) as { id: string; username: string; name: string; role: "ac" | "iaqc" | "cmd"; area: string; active: boolean; created_at: string }[])
    .map(u => ({ ...u, centres: centres.filter(c => c.ac_id === u.id) }));
}

export const AUDIT_PAGE_SIZE = 50;

export async function getAudit(page = 1) {
  const from = (page - 1) * AUDIT_PAGE_SIZE;
  const r = await db().from("audit_log").select("*", { count: "exact" }).order("id", { ascending: false }).range(from, from + AUDIT_PAGE_SIZE - 1);
  return { log: must(r) as { id: number; at: string; username: string | null; action: string; detail: string }[], total: r.count ?? 0 };
}
