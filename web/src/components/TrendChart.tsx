"use client";
import { motion } from "motion/react";
import { catColor, fmtDate, pct } from "@/lib/format";

type Pt = { visit_date: string; score: number | null; category: string };

/** Compliance trend over visits, drawn over the Green / Yellow / Red bands. */
export function TrendChart({ hist, th }: { hist: Pt[]; th: { green: number; yellow: number } }) {
  const pts = hist.filter((h): h is Pt & { score: number } => h.score != null);
  if (!pts.length) return <div className="empty">No scored assessments yet.</div>;
  const W = 340, H = 210, L = 30, R = 18, T = 20, B = 30; // sized for the side column so labels stay legible
  const lo = Math.max(0, Math.min(50, Math.floor(Math.min(...pts.map(p => p.score)) / 10) * 10 - 10));
  const t = pts.map(p => Date.parse(p.visit_date)), t0 = Math.min(...t), t1 = Math.max(...t);
  const x = (v: number) => (pts.length === 1 ? (L + W - R) / 2 : L + ((v - t0) / (t1 - t0)) * (W - L - R));
  const y = (v: number) => T + ((100 - v) / (100 - lo)) * (H - T - B);
  const band = (a: number, b: number, cls: string) => <rect className={cls} x={L} width={W - L - R} y={y(Math.min(b, 100))} height={Math.max(0, y(Math.max(a, lo)) - y(Math.min(b, 100)))} />;
  const ticks = [];
  for (let v = lo; v <= 100; v += 10) ticks.push(<g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="tick" x={L - 8} y={y(v) + 3.5} textAnchor="end">{v}</text></g>);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(t[i]).toFixed(1)},${y(p.score).toFixed(1)}`).join("");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Compliance score trend">
      {band(th.green, 100, "band-g")}{band(th.yellow, th.green, "band-y")}{band(lo, th.yellow, "band-r")}{ticks}
      <motion.path className="ln" d={d} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} />
      {pts.map((p, i) => (
        <motion.g key={i} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25 + (i / Math.max(1, pts.length - 1)) * 0.9, type: "spring", stiffness: 300, damping: 18 }} style={{ transformOrigin: `${x(t[i])}px ${y(p.score)}px` }}>
          <circle className="pt" cx={x(t[i])} cy={y(p.score)} r={4.5} style={{ stroke: catColor(p.category) }}><title>{`${fmtDate(p.visit_date)}: ${pct(p.score)} (${p.category})`}</title></circle>
          <text className="lbl" x={x(t[i])} y={y(p.score) - 11} textAnchor={pts.length > 1 && i === 0 ? "start" : pts.length > 1 && i === pts.length - 1 ? "end" : "middle"}>{p.score.toFixed(1)}</text>
          <text className="tick" x={x(t[i])} y={H - 10} textAnchor={pts.length > 1 && i === 0 ? "start" : pts.length > 1 && i === pts.length - 1 ? "end" : "middle"}>{fmtDate(p.visit_date)}</text>
        </motion.g>
      ))}
    </svg>
  );
}
