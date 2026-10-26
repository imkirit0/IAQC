// Post-seed check against your Supabase project. Run: npm run verify
//  1. the public (publishable) key can read/write nothing directly (RLS lockdown);
//  2. every seeded score, category and alert count matches the reference values;
//  3. submitted assessments cannot be edited (immutability trigger).
import { config } from "dotenv";
config({ path: ".env.local" });
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { compute } from "../src/lib/scoring";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, secret = process.env.SUPABASE_SECRET_KEY!;
assert(url && pub && secret, "Fill in .env.local first");
const anon = createClient(url, pub), admin = createClient(url, secret, { auth: { persistSession: false } });

// Reference results for the demo seed (G-TEC Checklist Criteria) (code → scores in visit order, "alerts" for the latest).
const EXPECTED: Record<string, { scores: number[]; cat: string; alerts: number }> = {
  "DEMO-EKM-01": { scores: [92.86, 89.05], cat: "Green", alerts: 1 }, "DEMO-EKM-02": { scores: [72.86, 66.67, 45.24], cat: "Red", alerts: 3 },
  "DEMO-KKD-01": { scores: [64.76, 46.67], cat: "Red", alerts: 3 }, "DEMO-KLM-01": { scores: [95.71, 97.14], cat: "Green", alerts: 0 },
  "DEMO-KLM-02": { scores: [100], cat: "Green", alerts: 0 }, "DEMO-MLP-01": { scores: [92.86, 97.14], cat: "Green", alerts: 0 },
  "DEMO-MLP-02": { scores: [66.67, 72.86], cat: "Yellow", alerts: 0 }, "DEMO-TSR-01": { scores: [66.67], cat: "Red", alerts: 0 },
  "DEMO-TSR-02": { scores: [98.1], cat: "Green", alerts: 0 }, "DEMO-TVM-01": { scores: [77.62, 80.48, 92.79], cat: "Green", alerts: 0 },
  "DEMO-TVM-02": { scores: [76.19, 68.1], cat: "Red", alerts: 0 }, "DEMO-KKD-02": { scores: [], cat: "Not Assessed", alerts: 0 },
};

async function main() {
  for (const t of ["profiles", "centres", "assessments", "audit_log", "settings", "support_requests", "support_events"]) {
    const { data } = await anon.from(t).select("*").limit(1);
    assert(!data?.length, `RLS leak: public key can read ${t}`);
  }
  const ins = await anon.from("audit_log").insert({ action: "X" });
  assert(ins.error, "RLS leak: public key can write");
  console.log("✓ public key has no direct table access");

  const { data: centres } = await admin.from("centres").select("id, code");
  const { data: rows } = await admin.from("assessments").select("*").order("visit_date").order("id");
  for (const c of centres!) {
    const exp = EXPECTED[c.code];
    if (!exp) continue;
    const res = rows!.filter(a => a.centre_id === c.id).map(a => compute(a.snapshot, a.responses));
    assert.deepEqual(res.map(r => r.score), exp.scores, `${c.code} scores`);
    if (res.length) { assert.equal(res.at(-1)!.category, exp.cat, `${c.code} category`); assert.equal(res.at(-1)!.alerts.length, exp.alerts, `${c.code} alerts`); }
  }
  console.log(`✓ ${Object.keys(EXPECTED).length} centres match reference scores, categories and alerts`);

  const upd = await admin.from("assessments").update({ general_remarks: "tamper" }).eq("id", rows![0].id);
  assert(upd.error && /immutable/i.test(upd.error.message), "assessments must be immutable");
  console.log("✓ submitted assessments cannot be edited");
}
main().catch(e => { console.error("✗", e.message); process.exit(1); });
