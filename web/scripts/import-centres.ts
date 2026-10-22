// Loads the real centre list (supabase/centres.json, converted from "CENTRE LIST.xlsx") and removes the DEMO centres.
// Run: npm run import-centres            (dry run: prints what would change)
//      npm run import-centres -- --apply (writes, in one transaction)
// Safe to re-run: centres already present (same ASO + name) are skipped. Real assessments are never touched.
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { Client } from "pg";

// ASO → centre code prefix.
const PREFIX: Record<string, string> = {
  Trivandrum: "TVM", Kollam: "KLM", Pathanamthitta: "PTA", Alappuzha: "ALP", Kottayam: "KTM", Idukki: "IDK", Ernakulam: "EKM",
  Thrissur: "TSR", Palakkad: "PKD", Malappuram: "MLP", Calicut: "CLT", Wayanad: "WYD", "Kannur & Kasaragode": "KNR",
};

const rows: { aso: string; centre: string }[] = JSON.parse(readFileSync("supabase/centres.json", "utf8"));
const url = process.env.DIRECT_URL;
if (!url) throw new Error("Set DIRECT_URL in .env.local");
const apply = process.argv.includes("--apply");

async function main() {
  const unknown = [...new Set(rows.map(r => r.aso))].filter(a => !PREFIX[a]);
  if (unknown.length) throw new Error(`No code prefix for ASO: ${unknown.join(", ")}`);

  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    await db.query("begin");
    const demo = (await db.query("select id from public.centres where demo")).rows.map(r => r.id);
    const existing = (await db.query("select code, name, district from public.centres where not demo")).rows as { code: string; name: string; district: string }[];
    const have = new Set(existing.map(c => `${c.district}|${c.name}`.toLowerCase()));
    const used = new Set(existing.map(c => c.code));

    // Demo reports are immutable by trigger; lift it only for this delete, inside the transaction.
    if (demo.length) {
      await db.query("alter table public.assessments disable trigger assessments_immutable");
      await db.query("delete from public.reviews where assessment_id in (select id from public.assessments where demo or centre_id = any($1))", [demo]);
      const a = await db.query("delete from public.assessments where demo or centre_id = any($1)", [demo]);
      await db.query("alter table public.assessments enable trigger assessments_immutable");
      await db.query("delete from public.centres where id = any($1)", [demo]);
      console.log(`removed ${demo.length} demo centres and ${a.rowCount} demo assessments`);
    }

    let added = 0;
    const next: Record<string, number> = {};
    for (const r of rows) {
      if (have.has(`${r.aso}|${r.centre}`.toLowerCase())) continue;
      const p = PREFIX[r.aso];
      let code;
      do code = `${p}-${String((next[p] = (next[p] ?? 0) + 1)).padStart(3, "0")}`; while (used.has(code));
      used.add(code);
      await db.query("insert into public.centres (code, name, location, district, active, demo) values ($1, $2, $2, $3, true, false)", [code, r.centre, r.aso]);
      added++;
    }
    console.log(`added ${added} centres, skipped ${rows.length - added} already present`);
    await db.query("insert into public.audit_log (username, action, detail) values ('system', 'CENTRES_IMPORTED', $1)",
      [`${added} centres imported from CENTRE LIST.xlsx; ${demo.length} demo centres removed`]);
    await db.query(apply ? "commit" : "rollback");
    console.log(apply ? "committed" : "dry run: rolled back (pass --apply to write)");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    await db.end();
  }
}
main().catch(e => { console.error("✗", e.message); process.exit(1); });
