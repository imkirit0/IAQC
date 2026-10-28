// Applies supabase/migrations/*.sql in order over the direct (session-mode) connection. Run: npm run migrate
import { config } from "dotenv";
config({ path: ".env.local" });
import { readdirSync, readFileSync } from "node:fs";
import { Client } from "pg";

const url = process.env.DIRECT_URL;
if (!url) throw new Error("Set DIRECT_URL in .env.local");

async function main() {
  const db = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await db.connect();
  for (const f of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    await db.query(readFileSync(`supabase/migrations/${f}`, "utf8")); // each file is idempotent
    console.log(`applied ${f}`);
  }
  const { rows } = await db.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('profiles','centres','sections','criteria','settings','assessments','reviews','audit_log','support_requests','support_events','directory','directory_changes','info_shares')");
  console.log(`${rows[0].n}/13 RDS tables present`);
  await db.end();
}
main().catch(e => { console.error("✗", e.message); process.exit(1); });
