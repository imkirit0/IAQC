// Seeds DEMO DATA into your Supabase project. Run: npm run seed            (only if empty)
//                                               npm run seed -- --reset (wipes demo data first)
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { compute, validateResponses, type Priority, type Snapshot } from "../src/lib/scoring";

type Seed = {
  checklist: { section: string; criteria: { key: string; text: string; priority: Priority; critical: number; mandatory: number }[] }[];
  users: { username: string; name: string; role: string; password: string; area: string; district?: string; department?: string }[];
  centres: { code: string; name: string; location: string; district: string; ac: string }[];
  assessments: Record<string, { days_ago: number; overrides: Record<string, { status: string; remark: string }>; general: string }[]>;
  reviews: { centre: string; index: number; criterion: string | null; outcome: string; note: string }[];
};
const S: Seed = JSON.parse(readFileSync("supabase/seed-data.json", "utf8"));
const WEIGHTS = { Critical: 10, High: 6, Medium: 3, Low: 1 };
const SETTINGS = { thresholds: { green: 85, yellow: 70 }, factors: { C: 100, P: 50, N: 0 }, priority_weights: WEIGHTS, visit_cycle_days: 60, checklist_version: 1 };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
const sb = createClient(url, key, { auth: { persistSession: false } });
const email = (u: string) => `${u}@rds.local`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function q(p: PromiseLike<{ data: any; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  const reset = process.argv.includes("--reset");
  const existing = await q(sb.from("profiles").select("id").limit(1));
  if (existing.length && !reset) return console.log("Database already has data. Use `npm run seed -- --reset` to replace it.");

  if (reset) {
    await q(sb.rpc("rds_reset_demo"));
    const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data.users.filter(u => u.email?.endsWith("@rds.local"))) await q(sb.auth.admin.deleteUser(u.id));
  }

  await q(sb.from("settings").insert(Object.entries(SETTINGS).map(([k, value]) => ({ key: k, value }))));
  const keys: Record<string, number> = {};
  for (const [si, sec] of S.checklist.entries()) {
    const s = await q(sb.from("sections").insert({ name: sec.section, sort: si + 1 }).select("id").single());
    for (const [ci, c] of sec.criteria.entries()) {
      const r = await q(sb.from("criteria").insert({ section_id: s.id, text: c.text, priority: c.priority, weight: WEIGHTS[c.priority], critical: !!c.critical, mandatory: !!c.mandatory, sort: ci + 1 }).select("id").single());
      keys[c.key] = r.id;
    }
  }

  const uid: Record<string, string> = {};
  for (const u of S.users) {
    const created = await q(sb.auth.admin.createUser({ email: email(u.username), password: u.password, email_confirm: true, ...(u.district && { app_metadata: { district: u.district } }) }));
    uid[u.username] = created.user!.id;
    await q(sb.from("profiles").insert({ id: created.user!.id, username: u.username, name: u.name, role: u.role, area: u.area, department: u.department ?? null }));
  }
  const cid: Record<string, number> = {};
  for (const c of S.centres) cid[c.code] = (await q(sb.from("centres").insert({ code: c.code, name: c.name, location: c.location, district: c.district, ac_id: uid[c.ac], demo: true }).select("id").single())).id;

  // Snapshot built exactly as a live submission builds it.
  const secs: { id: number; name: string }[] = await q(sb.from("sections").select("id, name").order("sort"));
  const crits: { id: number; section_id: number; text: string; description: string; priority: Priority; weight: number; critical: boolean; mandatory: boolean }[] =
    await q(sb.from("criteria").select("*").order("sort"));
  const snap: Snapshot = {
    version: 1, rules: { factors: SETTINGS.factors, thresholds: SETTINGS.thresholds },
    sections: secs.map(s => ({ id: s.id, name: s.name, criteria: crits.filter(c => c.section_id === s.id).map(c => ({ id: c.id, text: c.text, description: c.description, priority: c.priority, weight: c.weight, critical: c.critical, mandatory: c.mandatory })) })),
  };
  const aids: Record<string, number> = {};
  for (const [code, visits] of Object.entries(S.assessments)) {
    const ac = S.centres.find(c => c.code === code)!.ac;
    for (const [i, v] of visits.entries()) {
      const resp: Record<string, { status: string; remark: string }> = Object.fromEntries(crits.map(c => [String(c.id), { status: "C", remark: "" }]));
      for (const [k, o] of Object.entries(v.overrides)) resp[String(keys[k])] = o;
      const errs = validateResponses(snap, resp);
      if (errs.length) throw new Error(`${code}: ${errs.join("; ")}`);
      const vd = new Date(Date.now() - v.days_ago * 864e5).toISOString().slice(0, 10);
      const row = await q(sb.from("assessments").insert({ centre_id: cid[code], ac_id: uid[ac], visit_date: vd, submitted_at: `${vd}T17:30:00+05:30`, checklist_version: 1, snapshot: snap, responses: resp, general_remarks: v.general, demo: true }).select("id").single());
      aids[`${code}:${i}`] = row.id;
      const r = compute(snap, resp);
      console.log(`${code.padEnd(12)} ${vd}  ${String(r.score).padStart(6)}  ${r.category.padEnd(7)} alerts=${r.alerts.length}`);
    }
  }
  for (const r of S.reviews) await q(sb.from("reviews").insert({ assessment_id: aids[`${r.centre}:${r.index}`], criterion_id: r.criterion ? keys[r.criterion] : null, user_id: uid.iaqc, outcome: r.outcome, note: r.note }));
  await q(sb.from("audit_log").insert({ username: "system", action: "DEMO_SEED", detail: "Demo data loaded" }));
  console.log("\nSeeded DEMO DATA. Demo accounts:\n" + S.users.map(u => `  ${u.username.padEnd(10)} ${u.password}`).join("\n"));
}

main().catch(e => { console.error(e.message); process.exit(1); });
