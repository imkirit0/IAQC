import { Suspense } from "react";
import Loading from "../loading";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getRanking, type RankRow } from "@/lib/data";
import { categoryOf, fmtDate, pct } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { PrintButton } from "@/components/PrintButton";
import { AlertTag, Badge, CountUp, Distribution, Ledger, PageHead, Reveal, ScoreBar } from "@/components/ui";

export const metadata = { title: "Executive overview" };


const Line = ({ c }: { c: RankRow }) => (
  <Link href={`/scorecard/${c.id}`} className="line">
    <span className="grow"><b>{c.name}</b><span className="small faint" style={{ display: "block" }}>{c.district}</span></span>
    <AlertTag n={c.alerts.length} /><span className="num" style={{ fontSize: 16, minWidth: 70, textAlign: "right" }}>{pct(c.score)}</span>
    <span style={{ minWidth: 130 }}><Badge c={c.category} /></span>
  </Link>
);

async function Overview() {
  const me = await requireRole("cmd");
  const { centres: cs, settings } = await getRanking(undefined, undefined, me.district);
  const th = settings.thresholds;
  const scored = cs.filter(c => c.score != null);
  const avg = scored.length ? scored.reduce((a, c) => a + c.score!, 0) / scored.length : null;
  const count = (f: (c: RankRow) => boolean) => cs.filter(f).length;
  const attention = cs.filter(c => c.alerts.length || c.category === "Red" || (c.trend ?? 0) < 0 || c.category === "Not Assessed");
  const flagged = attention.filter(c => c.category !== "Not Assessed"), unassessed = attention.length - flagged.length;
  const cats: [string, number][] = ["Green", "Yellow", "Red", "Not Assessed"].map(k => [k, count(c => c.category === k)]);

  // Section-wise: average of each section's score across centres' latest assessments.
  const secMap = new Map<string, { sum: number; n: number; red: number; viol: number }>();
  scored.forEach(c => c.sections.forEach(s => {
    const m = secMap.get(s.name) ?? { sum: 0, n: 0, red: 0, viol: 0 };
    if (s.score != null) { m.sum += s.score; m.n++; if (s.category === "Red") m.red++; }
    m.viol += s.violations; secMap.set(s.name, m);
  }));
  const secs = [...secMap].map(([name, m]) => ({ name, avg: m.n ? m.sum / m.n : null, red: m.red, viol: m.viol })).sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0));
  const districts = new Map<string, { n: number; s: number; k: number; red: number; alerts: number }>();
  cs.forEach(c => {
    const d = districts.get(c.district) ?? { n: 0, s: 0, k: 0, red: 0, alerts: 0 };
    d.n++; if (c.score != null) { d.s += c.score; d.k++; } if (c.category === "Red") d.red++; if (c.alerts.length) d.alerts++;
    districts.set(c.district, d);
  });
  const ranked = [...scored].sort((a, b) => a.score! - b.score!);
  const latest = cs.map(c => c.last_visit).filter(Boolean).sort().at(-1);

  return (
    <>
      <PageHead title="Executive overview" sub={latest ? `Compliance position as of ${fmtDate(latest)} · ${cs.length} active centres` : `${cs.length} active centres · no assessments submitted yet`}><PrintButton label="Print summary" /></PageHead>
      <Reveal className="card" style={{ marginBottom: 22 }}>
        <div className="split">
          <div>{!scored.length ? <p className="statement">
            None of the <strong>{cs.length} centres</strong> has a submitted assessment yet. Scores, risk bands and rankings appear here as Area Coordinators submit visit reports.
          </p> : <p className="statement">
            Across the {scored.length} assessed centres, average compliance stands at <strong>{avg == null ? "—" : avg.toFixed(1) + "%"}</strong>, within the {categoryOf(avg, th)} band.{" "}
            <strong>{attention.length} centre{attention.length === 1 ? "" : "s"}</strong> require management attention: {count(c => c.alerts.length > 0)} with reported critical alerts,{" "}
            {count(c => c.category === "Red")} rated Red, {count(c => (c.trend ?? 0) < 0)} with rising risk and {count(c => c.category === "Not Assessed")} not yet assessed.
          </p>}</div>
          <div>
            <div className="small faint">Average compliance</div>
            <div className="row" style={{ alignItems: "baseline", margin: "6px 0 4px" }}>
              <span className="big-score">{avg == null ? "—" : <CountUp to={avg} decimals={1} />}<small>%</small></span>{avg != null && <Badge c={categoryOf(avg, th)} />}
            </div>
            <div className="small faint" style={{ marginBottom: 18 }}>Average risk {avg == null ? "—" : (100 - avg).toFixed(1) + "%"}</div>
            <Distribution cats={cats} total={cs.length} />
          </div>
        </div>
      </Reveal>
      <Ledger cells={[
        { label: "Active centres", value: cs.length }, { label: "Assessed", value: count(c => !!c.assessment_id) },
        { label: "Requiring attention", value: attention.length }, { label: "Critical alerts", value: count(c => c.alerts.length > 0), tone: "c" },
        { label: "Pending visits", value: count(c => c.due), note: `not visited in last ${settings.visit_cycle_days} days` },
      ]} />
      <Reveal delay={0.1} className="card">
        <div className="hd"><h2>Centres requiring management attention</h2></div>
        <div className="tw"><table>
          <thead><tr><th>Centre</th><th>ASO</th><th className="right">Compliance</th><th>Indicator</th><th>Reason</th><th /></tr></thead>
          <tbody>{flagged.length ? flagged.map(c => (
            <tr key={c.id} className={c.alerts.length ? "alert-row" : ""}>
              <td data-l="Centre"><Link href={`/scorecard/${c.id}`}><b>{c.name}</b></Link><div className="code">{c.code}</div></td>
              <td data-l="ASO">{c.district}</td><td data-l="Compliance" className="right"><span className="num" style={{ fontSize: 16 }}>{pct(c.score)}</span></td><td data-l="Indicator"><Badge c={c.category} /></td>
              <td data-l="Reason" className="small">
                {c.alerts.length > 0 && <div><AlertTag n={c.alerts.length} /> {c.alerts.map(a => a.text).join("; ")}</div>}
                {c.category === "Red" && <div>{c.override ? `Risk level set to Red by IAQA: ${c.override.note}` : `Compliance below ${th.yellow}%`}</div>}
                {(c.trend ?? 0) < 0 && <div>Compliance fell {Math.abs(c.trend!).toFixed(1)} pts since the previous visit</div>}
              </td>
              <td data-l="" className="right"><Link className="btn sm" href={`/scorecard/${c.id}`}>Scorecard</Link></td>
            </tr>)) : !unassessed && <tr><td data-l="" colSpan={6} className="empty">No centres currently require attention.</td></tr>}
            {unassessed > 0 && <tr><td data-l="" colSpan={5}><b>{unassessed} centre{unassessed === 1 ? "" : "s"} not yet assessed</b><div className="small faint">No assessment on record. Not treated as low risk.</div></td>
              <td data-l="" className="right"><Link className="btn sm" href="/ranking">View ranking</Link></td></tr>}</tbody>
        </table></div>
      </Reveal>
      <div className="cols mt">
        <Reveal delay={0.15} className="card">
          <div className="hd"><h2>Section-wise risk</h2><span className="small faint">average across latest assessments</span></div>
          <div className="tw"><table>
            <thead><tr><th>Section</th><th className="right">Average compliance</th><th className="right">Red</th><th className="right">Violations</th></tr></thead>
            <tbody>{!secs.length && <tr><td data-l="" colSpan={4} className="empty">No assessments submitted yet.</td></tr>}{secs.map(s => (
              <tr key={s.name}><td data-l="Section">{s.name}</td><td data-l="Average compliance" className="right" style={{ width: "40%" }}><div className="score-cell"><ScoreBar v={s.avg} c={categoryOf(s.avg, th)} /><span className="num">{s.avg == null ? "—" : s.avg.toFixed(1) + "%"}</span></div></td><td data-l="Red" className="right mono">{s.red}</td><td data-l="Violations" className="right mono">{s.viol}</td></tr>
            ))}</tbody>
          </table></div>
        </Reveal>
        <Reveal delay={0.2} className="card">
          <div className="hd"><h2>ASO summary</h2></div>
          <div className="tw"><table>
            <thead><tr><th>ASO</th><th className="right">Centres</th><th className="right">Avg compliance</th><th className="right">Red</th><th className="right">Alerts</th></tr></thead>
            <tbody>{[...districts].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => (
              <tr key={d}><td data-l="ASO">{d}</td><td data-l="Centres" className="right mono">{v.n}</td><td data-l="Avg compliance" className="right mono">{v.k ? (v.s / v.k).toFixed(1) + "%" : "—"}</td><td data-l="Red" className="right mono">{v.red}</td><td data-l="Alerts" className="right mono">{v.alerts}</td></tr>
            ))}</tbody>
          </table></div>
        </Reveal>
      </div>
      <div className="cols mt">
        <Reveal delay={0.25} className="card"><div className="hd"><h2>Highest-risk centres</h2></div><div className="bd">{ranked.length ? ranked.slice(0, 5).map(c => <Line key={c.id} c={c} />) : <p className="small muted" style={{ margin: 0 }}>No scored centres yet.</p>}</div></Reveal>
        <Reveal delay={0.3} className="card"><div className="hd"><h2>Lowest-risk centres</h2></div><div className="bd">{ranked.length ? ranked.slice(-5).reverse().map(c => <Line key={c.id} c={c} />) : <p className="small muted" style={{ margin: 0 }}>No scored centres yet.</p>}</div></Reveal>
      </div>
      <p className="small mt"><Link href="/ranking">View the full centre ranking <Icon name="right" /></Link></p>
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><Overview /></Suspense>;
}
