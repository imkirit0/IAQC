"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { CentreRecords as Records, Check } from "@/lib/data";
import { CHECK_OUTCOMES } from "@/lib/support";
import { recordCheck } from "@/app/actions";
import { fmtDT } from "@/lib/format";
import { Modal, formData } from "./Modal";
import { useToast } from "./Providers";

type Subject = Check["subject"];
const dash = <span className="faint">—</span>;

/** A centre's infrastructure and trainers from the Directory. With `checks` it also shows IAQA's verification for one assessment;
 *  with `assessmentId` as well, IAQA can record it. */
export function CentreRecords({ records, checks, assessmentId }: { records: Records; checks?: Record<string, Check>; assessmentId?: number }) {
  const router = useRouter(), toast = useToast();
  const [target, setTarget] = useState<{ subject: Subject; id: number; label: string } | null>(null);
  const current = new Set([...records.infra.map(i => `infrastructure:${i.id}`), ...records.trainers.map(t => `trainer:${t.id}`)]);
  // Checked for this assessment, then edited out of the centre or removed from the Directory: the record of the check stays.
  const gone = Object.entries(checks ?? {}).filter(([k]) => !current.has(k)).map(([, c]) => c);

  const state = (c?: Check) => !c ? <span className="faint">Not checked</span> : <>
    <span className={`badge ${c.outcome === "Verified" ? "b-green" : "b-red"}`}>{c.outcome}</span>
    {c.note && <div className="small" style={{ marginTop: 4 }}>{c.note}</div>}
    <div className="small faint">{c.by} · {fmtDT(c.at)}</div>
  </>;
  const tail = (subject: Subject, id: number, label: string): ReactNode => checks && <>
    <td data-l="IAQA verification">{state(checks[`${subject}:${id}`])}</td>
    {assessmentId && <td data-l="" className="nowrap right no-print"><button type="button" className="btn sm" onClick={() => setTarget({ subject, id, label })}>{checks[`${subject}:${id}`] ? "Update" : "Verify"}</button></td>}
  </>;
  const cols = 3 + (checks ? 1 : 0) + (assessmentId ? 1 : 0);

  return (
    <>
      <div className="tw"><table>
        <thead><tr><th>Infrastructure</th><th>Specifications</th>{checks && <th>IAQA verification</th>}{assessmentId && <th className="no-print" />}</tr></thead>
        <tbody>
          {records.infra.map(i => (
            <tr key={i.id}>
              <td data-l="Infrastructure"><b>{i.name}</b></td>
              <td data-l="Specifications" className="small">{i.specs.map((x, n) => <div key={n}><span className="muted">{x.label}:</span> {x.value || dash}</div>)}{!i.specs.length && <span className="faint">None added</span>}</td>
              {tail("infrastructure", i.id, i.name)}
            </tr>
          ))}
          {!records.infra.length && <tr><td data-l="" colSpan={cols} className="small faint" style={{ padding: "14px 20px" }}>No infrastructure is listed for this centre in the Directory.</td></tr>}
        </tbody>
      </table></div>
      <div className="tw"><table>
        <thead><tr><th>Trainer</th><th>Qualification / division</th><th>Centres</th>{checks && <th>IAQA verification</th>}{assessmentId && <th className="no-print" />}</tr></thead>
        <tbody>
          {records.trainers.map(t => (
            <tr key={t.id}>
              <td data-l="Trainer"><b>{t.name}</b><div className="small muted">GCTID {t.gctid || "not recorded"}</div>
                {(t.phone || t.email) && <div className="small faint">{[t.phone, t.email].filter(Boolean).join(" · ")}</div>}</td>
              <td data-l="Qualification / division" className="small">{t.qualification || dash}<div className="muted">Division: {t.division || "not recorded"}</div>{t.notes && <div className="faint">{t.notes}</div>}</td>
              <td data-l="Centres" className="small">{t.centres.map(n => <div key={n}>{n}</div>)}</td>
              {tail("trainer", t.id, t.name)}
            </tr>
          ))}
          {!records.trainers.length && <tr><td data-l="" colSpan={cols} className="small faint" style={{ padding: "14px 20px" }}>No trainers are linked to this centre in the Directory.</td></tr>}
          {gone.map(c => (
            <tr key={`${c.subject}:${c.subject_id}`}>
              <td data-l="Item" colSpan={3}><b>{c.label}</b><div className="small faint">{c.subject === "trainer" ? "Trainer" : "Infrastructure"} no longer listed for this centre</div></td>
              <td data-l="IAQA verification">{state(c)}</td>{assessmentId && <td data-l="" className="no-print" />}
            </tr>
          ))}
        </tbody>
      </table></div>

      <Modal open={!!target} onClose={() => setTarget(null)} title={`Verify: ${target?.label ?? ""}`} submitLabel="Record" onSubmit={async f => {
        const v = formData(f);
        if (!v.outcome) return "Choose Verified or Discrepancy.";
        const r = await recordCheck(assessmentId!, { subject: target!.subject, subject_id: target!.id, outcome: v.outcome, note: v.note });
        if (r.error) return r.error;
        toast(`${target!.label}: ${v.outcome.toLowerCase()} recorded`); router.refresh();
      }}>
        <p className="small muted">Recorded against this assessment with your name. The Directory entry and the submitted report are not changed.</p>
        <div className="levels" role="radiogroup" aria-label="Outcome">
          {CHECK_OUTCOMES.map(o => <label key={o} className={o === "Verified" ? "Green" : "Red"}><input type="radio" name="outcome" value={o} required /><b>{o}</b><span>{o === "Verified" ? "Matches what was found" : "Differs from what was found"}</span></label>)}
        </div>
        <label className="f"><span>Observations (required for a discrepancy)</span><textarea name="note" placeholder="What was checked, what was found, and how it differs from the Directory" /></label>
      </Modal>
    </>
  );
}
