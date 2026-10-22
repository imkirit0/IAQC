import Link from "next/link";
import type { RankRow } from "@/lib/data";
import { Icon } from "@/components/Icon";
import { Distribution, Reveal, TrendCell } from "@/components/ui";

/** Right-hand rail: what needs eyes first. */
export function RiskRail({ centres }: { centres: RankRow[] }) {
  const crit = centres.filter(c => c.alerts.length);
  const rising = centres.filter(c => (c.trend ?? 0) < 0).sort((a, b) => a.trend! - b.trend!);
  const cats: [string, number][] = ["Green", "Yellow", "Red", "Not Assessed"].map(k => [k, centres.filter(c => c.category === k).length]);
  return (
    <aside className="rail-row" aria-label="Risk summary">
      <Reveal delay={0.1} className="card" style={{ borderColor: "var(--crit-rule)" }}>
        <div className="hd" style={{ background: "var(--crit-soft)", color: "var(--crit)" }}><Icon name="alert" /><h3>Critical alerts</h3><span className="spacer" /><span className="num" style={{ fontSize: 18 }}>{crit.length}</span></div>
        <div className="bd">
          {crit.length ? (
            <>
              <ul className="mini-list">{crit.map(c => (
                <li key={c.id}><Link href={`/scorecard/${c.id}`}>{c.name}</Link>
                  <div className="muted" style={{ marginTop: 2 }}>{c.alerts.map(a => a.text).join("; ")}</div>
                  <div className="small faint" style={{ marginTop: 4 }}>{c.alerts[0].verification}</div></li>
              ))}</ul>
              <p className="small faint" style={{ margin: "14px 0 0" }}>A critical alert is a reported issue for management review. It does not by itself establish misconduct.</p>
            </>
          ) : <p className="small muted" style={{ margin: 0 }}>No open critical alerts.</p>}
        </div>
      </Reveal>
      <Reveal delay={0.18} className="card">
        <div className="hd"><h3>Risk distribution</h3></div>
        <div className="bd"><Distribution cats={cats} total={centres.length} /></div>
      </Reveal>
      <Reveal delay={0.26} className="card">
        <div className="hd"><h3>Rising risk</h3><span className="spacer" /><span className="small faint">since previous visit</span></div>
        <div className="bd">
          {rising.length ? <ul className="mini-list">{rising.map(c => (
            <li key={c.id} className="row" style={{ flexWrap: "nowrap" }}><Link className="grow" href={`/scorecard/${c.id}`}>{c.name}</Link><TrendCell trend={c.trend} /></li>
          ))}</ul> : <p className="small muted" style={{ margin: 0 }}>No centre has declined since its previous visit.</p>}
        </div>
      </Reveal>
    </aside>
  );
}
