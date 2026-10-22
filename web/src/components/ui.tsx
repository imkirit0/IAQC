"use client";
// Small presentational pieces with their animations.
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { CAT_CLASS, CAT_LABEL, catColor, pct } from "@/lib/format";

const EASE = [0.16, 1, 0.3, 1] as const;

export const Badge = ({ c, bare }: { c: string; bare?: boolean }) =>
  <span className={`badge ${CAT_CLASS[c] ?? "b-grey"}`} title={bare ? c : undefined}>{bare ? null : CAT_LABEL[c] ?? c}</span>;

export const AlertTag = ({ n }: { n: number }) => n ? (
  <span className="alert" title="Reported critical violation, pending verification"><Icon name="alert" />{n > 1 ? `${n} ` : ""}Critical</span>
) : null;

export function PageHead({ title, sub, back, children }: { title: ReactNode; sub?: ReactNode; back?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ph">
      <div className="grow">{back}<h1>{title}</h1>{sub ? <div className="sub">{sub}</div> : null}</div>
      {children}
    </div>
  );
}

/** Thin bar that grows to its value once it scrolls into view. */
export function ScoreBar({ v, c }: { v: number | null; c: string }) {
  return (
    <div className="bar" title={pct(v)}>
      <motion.i style={{ background: catColor(c) }} initial={{ width: 0 }} whileInView={{ width: `${v ?? 0}%` }} viewport={{ once: true }} transition={{ duration: 0.9, ease: EASE }} />
    </div>
  );
}

/** Number that counts up from zero the first time it is seen. */
export function CountUp({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null), seen = useInView(ref, { once: true });
  const mv = useMotionValue(0), text = useTransform(mv, v => v.toFixed(decimals) + suffix);
  useEffect(() => { if (seen) { const a = animate(mv, to, { duration: 1.1, ease: EASE }); return () => a.stop(); } }, [seen, to, mv]);
  return <motion.span ref={ref}>{text}</motion.span>;
}

export type LedgerCell = { label: string; value: number; tone?: "g" | "y" | "r" | "c"; note?: string };
export function Ledger({ cells }: { cells: LedgerCell[] }) {
  return (
    <motion.div className="kpis" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
      {cells.map(c => (
        <motion.div key={c.label} className={`kpi ${c.tone === "c" && !c.value ? "" : c.tone ?? ""}`} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}>
          <div className="l">{c.label}</div><div className="v"><CountUp to={c.value} /></div>{c.note ? <div className="small faint">{c.note}</div> : null}
        </motion.div>
      ))}
    </motion.div>
  );
}

export function TrendCell({ trend }: { trend: number | null }) {
  if (trend == null) return <span className="faint">—</span>;
  if (trend < 0) return <span className="trend trend-up" title={`Compliance fell ${Math.abs(trend).toFixed(2)} pts since the previous visit`}><Icon name="up" />Risk +{Math.abs(trend).toFixed(1)}</span>;
  if (trend > 0) return <span className="trend trend-down" title={`Compliance improved ${trend.toFixed(2)} pts since the previous visit`}><Icon name="down" />Risk −{trend.toFixed(1)}</span>;
  return <span className="faint small">No change</span>;
}

export function Distribution({ cats, total }: { cats: [string, number][]; total: number }) {
  return (
    <>
      <div className="dist">
        {cats.filter(([, n]) => n).map(([k, n], i) => (
          <motion.i key={k} title={`${k}: ${n}`} style={{ background: catColor(k) }} initial={{ width: 0 }} animate={{ width: `${(n / total) * 100}%` }} transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: EASE }} />
        ))}
      </div>
      <ul className="dist-list">{cats.map(([k, n]) => (
        <li key={k} style={{ ["--c" as string]: catColor(k) }}><span>{CAT_LABEL[k] ?? k}</span><b>{n}</b><span className="faint">{total ? Math.round((n / total) * 100) : 0}%</span></li>
      ))}</ul>
    </>
  );
}

/** Staggered reveal for a list of blocks (cards, rows of a page). */
export function Reveal({ children, delay = 0, className, style }: { children: ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.div className={className} style={style} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}
