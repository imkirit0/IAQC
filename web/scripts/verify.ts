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

// Reference results for the demo seed (G-TEC Operations/Academics criteria plus the four restored sections) (code → scores in visit order, "alerts" for the latest).
const EXPECTED: Record<string, { scores: number[]; cat: string; alerts: number }> = {
  "DEMO-EKM-01": { scores: [93.57, 89.05], cat: "Green", alerts: 2 }, "DEMO-EKM-02": { scores: [74.29, 67.38, 50.95], cat: "Red", alerts: 3 },
  "DEMO-KKD-01": { scores: [68.33, 52.62], cat: "Red", alerts: 3 }, "DEMO-KLM-01": { scores: [96.43, 97.86], cat: "Green", alerts: 0 },
  "DEMO-KLM-02": { scores: [98.44], cat: "Green", alerts: 0 }, "DEMO-MLP-01": { scores: [93.57, 96.43], cat: "Green", alerts: 0 },
  "DEMO-MLP-02": { scores: [69.05, 77.14], cat: "Yellow", alerts: 0 }, "DEMO-TSR-01": { scores: [71.19], cat: "Yellow", alerts: 0 },
  "DEMO-TSR-02": { scores: [98.81], cat: "Green", alerts: 0 }, "DEMO-TVM-01": { scores: [83.1, 87.38, 94.95], cat: "Green", alerts: 0 },
  "DEMO-TVM-02": { scores: [76.67, 70.48], cat: "Yellow", alerts: 0 }, "DEMO-KKD-02": { scores: [], cat: "Not Assessed", alerts: 0 },
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
