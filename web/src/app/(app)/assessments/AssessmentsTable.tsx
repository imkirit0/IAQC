"use client";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { AlertTag, Badge } from "@/components/ui";
import { fmtDate, pct, ref } from "@/lib/format";

type Row = { id: number; centre_id: number; centre_name: string; code: string; district: string; ac_name: string; visit_date: string; score: number | null; category: string; alerts: number; assessed: number; na: number; version: number; override: boolean };

export function AssessmentsTable({ list }: { list: Row[] }) {
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [crit, setCrit] = useState(false);
  const s = q.toLowerCase();
  const rows = list.filter(a => (!s || `${a.centre_name} ${a.code} ${a.ac_name}`.toLowerCase().includes(s)) && (!cat || a.category === cat) && (!crit || a.alerts > 0));
  return (
    <div className="card">
      <div className="filters">
        <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search centre, code or coordinator" aria-label="Search assessments" /></div>
        <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{["Red", "Yellow", "Green", "Unscorable"].map(c => <option key={c}>{c}</option>)}</select>
        <label className="check small" style={{ margin: 0 }}><input type="checkbox" checked={crit} onChange={e => setCrit(e.target.checked)} /> Critical alerts only</label>
        <span className="spacer" /><span className="small faint">{rows.length} of {list.length}</span>
      </div>
      <div className="tw">{rows.length ? (
        <table>
          <thead><tr><th>Ref</th><th>Visit date</th><th>Centre</th><th>ASO</th><th>Area Coordinator</th><th className="right">Compliance</th><th>Indicator</th><th>Alert</th><th className="right">Assessed / N/A</th><th>Checklist</th><th /></tr></thead>
          <tbody><AnimatePresence initial={false}>{rows.map((a, i) => (
            <motion.tr key={a.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: Math.min(i, 15) * 0.015 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <td data-l="Ref" className="code nowrap">{ref(a.id)}</td><td data-l="Visit date" className="nowrap">{fmtDate(a.visit_date)}</td>
              <td data-l="Centre"><Link href={`/scorecard/${a.centre_id}?a=${a.id}`}><b>{a.centre_name}</b></Link><div className="code">{a.code}</div></td>
              <td data-l="ASO">{a.district}</td><td data-l="Area Coordinator">{a.ac_name}</td>
              <td data-l="Compliance" className="right"><span className="num" style={{ fontSize: 15 }}>{pct(a.score)}</span></td>
              <td data-l="Indicator"><Badge c={a.category} />{a.override && <div className="set-by">Set by IAQA</div>}</td><td data-l="Alert"><AlertTag n={a.alerts} /></td>
              <td data-l="Assessed / N/A" className="right mono">{a.assessed} / {a.na}</td><td data-l="Checklist" className="small">v{a.version}</td>
              <td data-l="" className="right"><Link className="btn sm" href={`/scorecard/${a.centre_id}?a=${a.id}`}>Open</Link></td>
            </motion.tr>
          ))}</AnimatePresence></tbody>
        </table>
      ) : <div className="empty"><b>No matching assessments</b>Adjust the search or filters.</div>}</div>
    </div>
  );
}
