import { Suspense } from "react";
import Loading from "../../loading";
import Link from "next/link";
import { notFound } from "next/navigation";
import { inScope, requireRole } from "@/lib/auth";
import { getAssessment, getScorecard, getSettings, visitLocation } from "@/lib/data";
import { fmtDate, fmtDT, pct, ref } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { PrintButton } from "@/components/PrintButton";
import { TrendChart } from "@/components/TrendChart";
import { Gauge } from "@/components/Gauge";
import { AlertTag, Badge, CountUp, Ledger, LocationNote, PageHead, Reveal, ScoreBar } from "@/components/ui";
import { STATUS_LABEL, type Status } from "@/lib/scoring";
import { AssessmentPicker, ItemsTable, AddReview, RiskLevelControl } from "./parts";

export const metadata = { title: "Centre scorecard" };

async function Scorecard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string }> }) {
  const me = await requireRole("iaqc", "cmd");
  const [{ id }, { a: aParam }] = await Promise.all([params, searchParams]);
  const sc = await getScorecard(Number(id));
  if (!sc || !inScope(me, sc.centre.district)) notFound();
  const { centre: c, history: hist } = sc;
  const aid = aParam ? Number(aParam) : hist.at(-1)?.id;
  const a = aid ? await getAssessment(aid) : null;
  if (a && a.centre_id !== c.id) notFound();
  const isLatest = a && hist.at(-1)?.id === a.id;
  const loc = a ? visitLocation(a.gps, c, (await getSettings()).gps_flag_m) : null;

  return (
    <>
      <PageHead
        back={<><Link href="/ranking" className="back no-print"><Icon name="left" />Back to ranking</Link><div className="code">{c.code}{c.demo ? " · DEMO DATA" : ""}{c.active ? "" : " · INACTIVE"}</div></>}
        title={c.name} sub={`${c.location}, ${c.district} · Area Coordinator: ${c.ac_name ?? "Unassigned"}`}>
        <div className="row no-print">
          {hist.length > 0 && <AssessmentPicker centreId={c.id} current={aid!} options={[...hist].reverse().map(h => ({ id: h.id, label: `${fmtDate(h.visit_date)} · ${pct(h.score)}` }))} />}
          <PrintButton label="Print report" />
        </div>
      </PageHead>

      {!a ? <div className="card"><div className="empty"><b>Not assessed</b>No assessment has been submitted for this centre. It is not treated as low risk.</div></div> : (
        <>
          <Reveal className="card sc-hero" style={{ marginBottom: 22 }}>
            <div className="sc-score">
              <Gauge score={a.score} thresholds={a.thresholds} />
              <div>
                <div className="small faint">Compliance score</div>
                <div className="big-score" style={{ margin: "6px 0 12px" }}>{a.score == null ? "—" : <CountUp to={a.score} decimals={2} />}<small>%</small></div>
                <div className="row" style={{ gap: 10 }}><Badge c={a.category} /><AlertTag n={a.alerts.length} />
                  {me.role === "iaqc" && <RiskLevelControl assessmentId={a.id} current={a.category} computed={a.computed_category} overridden={!!a.override} />}</div>
                {a.override && <div className="override-note"><b>Set by IAQA</b> · {a.override.by}, {fmtDate(a.override.at)} · computed level {a.computed_category}<span>{a.override.note}</span></div>}
                <div className="small muted" style={{ marginTop: 10 }}>Risk <b>{pct(a.risk)}</b> · {a.earned} of {a.max} applicable points</div>
              </div>
            </div>
            <dl className="info-list sc-facts">
              <dt>Assessment date</dt><dd>{fmtDate(a.visit_date)} <span className={`chip ${isLatest ? "ok" : ""}`}>{isLatest ? "Latest" : "Historical"}</span></dd>
              <dt>Reported by</dt><dd>{a.ac_name}</dd>
              <dt>Submitted</dt><dd>{fmtDT(a.submitted_at)} · Ref {ref(a.id)}</dd>
              <dt>Status</dt><dd>{a.status === "Scored" ? "Submitted and scored" : a.status} · {a.reviews.length ? "Reviewed by IAQA" : "Awaiting IAQA review"}</dd>
              <dt>Checklist</dt><dd>Version {a.checklist_version} <span className="small faint">— scored with the rules in force at submission</span></dd>
              <dt>Visit location</dt><dd><LocationNote loc={loc} /></dd>
            </dl>
          </Reveal>

          {a.alerts.length > 0 && (
            <Reveal delay={0.05} className="banner crit"><Icon name="alert" /><div>
              <b>Critical-risk alert{a.alerts.length > 1 ? "s" : ""}: a reported issue, not an established finding</b>
              {a.alerts.map(al => <div key={al.criterion_id} style={{ marginTop: 8 }}><b className="alert-text">{al.text}</b> <span className="small">· {al.section} · {al.verification}</span>
                <div className="small" style={{ opacity: 0.85, marginTop: 2 }}>{al.remark}</div></div>)}
            </div></Reveal>
          )}

          <Ledger cells={[
            { label: "Compliant", value: a.counts.C, tone: "g" }, { label: "Partially compliant", value: a.counts.P, tone: "y" },
            { label: "Non-compliant", value: a.counts.N, tone: "r" }, { label: "Not applicable", value: a.counts.NA, note: "excluded from maximum" },
            { label: "Criteria assessed", value: a.assessed, note: `of ${a.assessed + a.counts.NA} on checklist` },
          ]} />

          <div className="with-rail"><div>
            <Reveal delay={0.08} className="card">
              <div className="hd"><h2>Section analysis</h2></div>
              <div className="tw"><table>
                <thead><tr><th>Section</th><th className="right">Earned</th><th className="right">Max</th><th className="right">Compliance</th><th>Indicator</th><th className="right">Violations</th></tr></thead>
                <tbody>
                  {a.sections.map(s => (
                    <tr key={s.id}><td data-l="Section">{s.name}</td><td data-l="Earned" className="right mono">{s.earned}</td><td data-l="Max" className="right mono">{s.max}</td>
                      <td data-l="Compliance" className="right"><div className="score-cell"><ScoreBar v={s.score} c={s.category} /><span className="num">{pct(s.score)}</span></div></td>
                      <td data-l="Indicator"><Badge c={s.category} /></td><td data-l="Violations" className="right mono">{s.violations}</td></tr>
                  ))}
                  <tr className="total"><td data-l="Section">Overall</td><td data-l="Earned" className="right mono">{a.earned}</td><td data-l="Max" className="right mono">{a.max}</td>
                    <td data-l="Compliance" className="right"><div className="score-cell"><span className="num">{pct(a.score)}</span></div></td><td data-l="Indicator"><Badge c={a.category} /></td><td data-l="Violations" className="right mono">{a.counts.N + a.counts.P}</td></tr>
                </tbody>
              </table></div>
              <div className="formula">Compliance = earned ÷ applicable maximum × 100 = {a.earned} ÷ {a.max} × 100 = <b>{pct(a.score)}</b>. Risk = 100 − compliance = <b>{pct(a.risk)}</b>.{" "}
                Each response earns a share of the criterion weight: Compliant {a.factors.C}%, Partially {a.factors.P}%, Non-compliant {a.factors.N}%. Not Applicable is excluded from the maximum.
                Thresholds: Green ≥ {a.thresholds.green}%, Yellow ≥ {a.thresholds.yellow}%.</div>
            </Reveal>
            <Reveal delay={0.12} className="card" style={{ marginTop: 22 }}><ItemsTable items={a.items} /></Reveal>
            {a.general_remarks && (
              <Reveal delay={0.14} className="card" style={{ marginTop: 22 }}><div className="hd"><h2>General remarks</h2><span className="small faint">from the Area Coordinator</span></div>
                <div className="bd"><p className="statement" style={{ fontSize: 17 }}>{a.general_remarks}</p></div></Reveal>
            )}
          </div>
          <aside className="rail">
            <Reveal delay={0.1} className="card">
              <div className="hd"><h3>Score history</h3></div>
              <div className="bd" style={{ padding: "14px 12px 4px" }}><TrendChart hist={hist} th={a.thresholds} /></div>
              <ul className="mini-list" style={{ padding: "4px 20px 16px" }}>
                {[...hist].reverse().map((h, i, arr) => {
                  const p = arr[i + 1], ch = p && p.category !== h.category ? `${p.category} → ${h.category}` : "";
                  return (
                    <li key={h.id} className="row" style={{ flexWrap: "nowrap", gap: 10 }}>
                      {h.id === a.id ? <b className="grow">{fmtDate(h.visit_date)}</b> : <Link className="grow" style={{ fontWeight: 500 }} href={`/scorecard/${c.id}?a=${h.id}`}>{fmtDate(h.visit_date)}</Link>}
                      <span className="small faint">{ch}</span><span className="mono">{pct(h.score)}</span><Badge c={h.category} bare />
                    </li>
                  );
                })}
              </ul>
            </Reveal>
            <Reveal delay={0.16} className="card">
              <div className="hd"><h3>Unresolved concerns</h3></div>
              <div className="bd">
                {sc.unresolved.length ? <ul className="mini-list">{sc.unresolved.map(u => (
                  <li key={`${u.assessment_id}-${u.criterion_id}`}><AlertTag n={1} /><div style={{ marginTop: 6, fontWeight: 600 }}>{u.text}</div><div className="small faint">Reported {fmtDate(u.visit_date)} · {u.verification}</div></li>
                ))}</ul> : <p className="small muted" style={{ margin: 0 }}>No open critical alerts.</p>}
                <div className="nav-label" style={{ padding: "18px 0 8px" }}>Recurring non-compliance</div>
                {sc.recurring.length ? <ul className="mini-list">{sc.recurring.map(r => (
                  <li key={r.text}><span className="st-N">{r.text}</span><div className="small faint">{r.section} · first reported {fmtDate(r.first_reported)} · {r.times} visits</div></li>
                ))}</ul> : <p className="small muted" style={{ margin: 0 }}>Nothing non-compliant across consecutive visits.</p>}
              </div>
            </Reveal>
            <Reveal delay={0.22} className="card">
              <div className="hd"><h3>Verification record</h3><span className="spacer" />
                {me.role === "iaqc" && <AddReview assessmentId={a.id} items={a.items.map(i => ({ id: i.id, text: i.text, status: i.status, alert: i.alert }))} />}</div>
              <div className="bd">
                <p className="small faint" style={{ margin: "0 0 12px" }}>Kept separately. The Area Coordinator&apos;s original report is never changed.</p>
                {a.reviews.length ? <ul className="mini-list">{a.reviews.map(r => (
                  <li key={r.id}>
                    <div className="row" style={{ gap: 8 }}><span className="chip">{r.outcome}{r.outcome === "Risk Level Set" ? `: ${r.set_category ?? "computed"}` : ""}</span><span className="small faint">{fmtDT(r.at)}</span></div>
                    <div className="small" style={{ marginTop: 6, fontWeight: 600 }}>{r.outcome === "Risk Level Set" ? "Risk level" : a.items.find(i => i.id === r.criterion_id)?.text ?? "Whole report"}</div>
                    <div className="small muted" style={{ marginTop: 2 }}>{r.note}</div>
                    {r.corrected_status && <div className="small" style={{ marginTop: 4 }}>Corrected status: <span className={`st-${r.corrected_status}`}>{STATUS_LABEL[r.corrected_status as Status]}</span></div>}
                    <div className="small faint" style={{ marginTop: 4 }}>{r.reviewer}</div>
                  </li>
                ))}</ul> : <p className="small muted" style={{ margin: 0 }}>No verification notes yet.</p>}
              </div>
            </Reveal>
          </aside></div>
        </>
      )}
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense(props: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string }> }) {
  return <Suspense fallback={<Loading />}><Scorecard {...props} /></Suspense>;
}
