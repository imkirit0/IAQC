"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { RankRow } from "@/lib/data";
import { fmtDate, pct } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { AlertTag, Badge, ScoreBar, TrendCell } from "@/components/ui";

type Key = "rank" | "name" | "district" | "score" | "category" | "trend" | "last_visit" | "ac_name";
const COLS: [Key | null, string][] = [["rank", "Rank"], ["name", "Centre"], ["district", "ASO"], ["score", "Compliance"], ["category", "Risk indicator"],
  ["trend", "Trend"], ["last_visit", "Last assessed"], ["ac_name", "Area Coordinator"], [null, ""]];
const CATS = ["Red", "Yellow", "Green", "Not Assessed", "Critical alert", "Rising risk", "Visit overdue"];

export function RankingTable({ centres, from, to, defaultDir }: { centres: RankRow[]; from: string; to: string; defaultDir: 1 | -1 }) {
  const router = useRouter();
  const [q, setQ] = useState(""), [district, setDistrict] = useState(""), [ac, setAc] = useState(""), [cat, setCat] = useState("");
  const [sort, setSort] = useState<Key>("rank"), [dir, setDir] = useState<number>(defaultDir);
  const districts = [...new Set(centres.map(c => c.district))].sort(), acs = [...new Set(centres.map(c => c.ac_name).filter(Boolean) as string[])].sort();

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return centres
      .filter(c => (!s || `${c.name} ${c.code} ${c.location}`.toLowerCase().includes(s)) && (!district || c.district === district) && (!ac || c.ac_name === ac)
        && (!cat || c.category === cat || (cat === "Critical alert" && c.alerts.length > 0) || (cat === "Rising risk" && (c.trend ?? 0) < 0) || (cat === "Visit overdue" && c.due)))
      .sort((a, b) => {
        // Not Assessed centres always sink to the bottom so they never read as "low risk".
        const na = Number(a.score == null) - Number(b.score == null);
        if (na && ["rank", "score", "category"].includes(sort)) return na;
        if (sort === "score" || sort === "trend" || sort === "rank") return ((a[sort] ?? 999) - (b[sort] ?? 999)) * dir;
        return String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, { numeric: true }) * dir;
      });
  }, [centres, q, district, ac, cat, sort, dir]);

  const setPeriod = (f: string, t: string) => router.push(`?${new URLSearchParams(Object.entries({ from: f, to: t }).filter(([, v]) => v)).toString()}`, { scroll: false });
  const sortBy = (k: Key) => { setDir(sort === k ? -dir : 1); setSort(k); };
  const reset = () => { setQ(""); setDistrict(""); setAc(""); setCat(""); if (from || to) setPeriod("", ""); };

  return (
    <div className="card">
      <div className="filters">
        <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search centre, code or location" aria-label="Search centres" /></div>
        <select value={district} onChange={e => setDistrict(e.target.value)} aria-label="ASO"><option value="">All ASOs</option>{districts.map(d => <option key={d}>{d}</option>)}</select>
        <select value={ac} onChange={e => setAc(e.target.value)} aria-label="Area Coordinator"><option value="">All Area Coordinators</option>{acs.map(d => <option key={d}>{d}</option>)}</select>
        <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Risk category"><option value="">All categories</option>{CATS.map(d => <option key={d}>{d}</option>)}</select>
        <span className="small faint">Period</span>
        <input type="date" value={from} onChange={e => setPeriod(e.target.value, to)} aria-label="Period from" />
        <span className="small faint">to</span>
        <input type="date" value={to} onChange={e => setPeriod(from, e.target.value)} aria-label="Period to" />
        <button type="button" className="btn sm quiet" onClick={reset}>Reset filters</button>
        <span className="spacer" /><span className="small faint">{rows.length} of {centres.length} centres</span>
      </div>
      <div className="tw">
        {rows.length ? (
          <table>
            <thead><tr>{COLS.map(([k, l]) => k ? (
              <th key={l} className={`sort${sort === k ? " sorted" : ""}${k === "score" ? " right" : ""}`} tabIndex={0} aria-sort={sort === k ? (dir > 0 ? "ascending" : "descending") : "none"}
                onClick={() => sortBy(k)} onKeyDown={e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), sortBy(k))}>
                {l}{sort === k && <Icon name={dir > 0 ? "up" : "down"} />}
              </th>) : <th key="x" />)}</tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((c, i) => (
                  <motion.tr key={c.id} layout="position" className={c.alerts.length ? "alert-row" : ""}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: Math.min(i, 12) * 0.025 } }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ layout: { type: "spring", stiffness: 500, damping: 42 } }}>
                    <td><span className="rank">{c.rank}</span></td>
                    <td><Link href={`/scorecard/${c.id}`}><b>{c.name}</b></Link><div className="code">{c.code}</div></td>
                    <td>{c.district}{c.location !== c.name && <div className="small faint">{c.location}</div>}</td>
                    <td className="right"><span className="num" style={{ fontSize: 16 }}>{pct(c.score)}</span>
                      {c.score != null && <><ScoreBar v={c.score} c={c.category} /><div className="small faint" style={{ marginTop: 3 }}>Risk {pct(c.risk)}</div></>}</td>
                    <td><div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}><Badge c={c.category} />{c.override && <span className="set-by">Set by IAQA</span>}<AlertTag n={c.alerts.length} /></div></td>
                    <td><TrendCell trend={c.trend} /></td>
                    <td className="nowrap">{fmtDate(c.last_visit)}<div className={c.due ? "small" : "small faint"} style={c.due ? { color: "var(--amber)" } : undefined}>{c.days_since == null ? "Never visited" : c.days_since === 0 ? "Today" : `${c.days_since} day${c.days_since === 1 ? "" : "s"} ago`}</div></td>
                    <td>{c.reported_by ?? c.ac_name ?? "—"}</td>
                    <td className="right"><Link className="btn sm" href={`/scorecard/${c.id}`}>Scorecard</Link></td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        ) : <div className="empty"><b>No matching centres</b>Adjust or reset the filters to see more centres.</div>}
      </div>
    </div>
  );
}
