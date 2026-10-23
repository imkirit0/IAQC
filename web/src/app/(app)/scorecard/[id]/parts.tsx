"use client";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useState } from "react";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { AlertTag } from "@/components/ui";
import { addReview, setRiskLevel } from "@/app/actions";
import { STATUS_LABEL, type Item, type Status } from "@/lib/scoring";

export function AssessmentPicker({ centreId, current, options }: { centreId: number; current: number; options: { id: number; label: string }[] }) {
  const router = useRouter();
  return (
    <label className="small faint" style={{ display: "flex", alignItems: "center", gap: 8 }}>Assessment
      <select style={{ width: "auto" }} value={current} onChange={e => router.push(`/scorecard/${centreId}?a=${e.target.value}`)}>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function ItemsTable({ items }: { items: Item[] }) {
  const [only, setOnly] = useState(false);
  const shown = items.filter(i => !only || i.status === "N" || i.status === "P");
  return (
    <>
      <div className="hd"><h2>Checklist responses</h2><span className="spacer" />
        <div className="seg no-print" role="group" aria-label="Filter responses">
          <button type="button" aria-pressed={!only} onClick={() => setOnly(false)}>All {items.length}</button>
          <button type="button" aria-pressed={only} onClick={() => setOnly(true)}>Violations {items.filter(i => i.status === "N" || i.status === "P").length}</button>
        </div>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Criterion</th><th>Priority</th><th className="right">Weight</th><th>Response</th><th className="right">Points</th><th>Area Coordinator&apos;s remarks</th><th>Flag</th></tr></thead>
        <tbody>
          <AnimatePresence initial={false}>
            {shown.map((i, n) => {
              const head = n === 0 || shown[n - 1].section !== i.section ? i.section : null;
              return (
                <Fragment key={i.id}>
                  {head && <motion.tr layout className="group" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><td colSpan={7}>{head}</td></motion.tr>}
                  <motion.tr layout className={i.alert ? "alert-row" : ""} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
                    <td style={{ minWidth: 240 }}>{i.text}{i.mandatory && <> <span className="chip mand">Mandatory</span></>}</td>
                    <td><span className={`chip ${i.priority}`}>{i.priority}</span></td>
                    <td className="right mono">{i.weight}</td>
                    <td className="nowrap">{i.status ? <span className={`st-${i.status}`}>{STATUS_LABEL[i.status]}</span> : <span className="req">Unanswered</span>}</td>
                    <td className="right mono nowrap">{i.points == null ? <span className="faint">excl.</span> : `${+i.points.toFixed(2)} / ${i.weight}`}</td>
                    <td className="small">{i.remark || <span className="faint">—</span>}</td>
                    <td>{i.alert ? <AlertTag n={1} /> : i.critical ? <span className="chip crit" title="Critical criterion">Critical item</span> : null}</td>
                  </motion.tr>
                </Fragment>
              );
            })}
          </AnimatePresence>
          {!shown.length && <tr><td colSpan={7} className="empty">No violations.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

const LEVELS = [["Green", "Low risk"], ["Yellow", "Moderate"], ["Red", "High risk"]] as const;

/** IAQA override of the report's risk level. The computed level stays on record; a reason is required. */
export function RiskLevelControl({ assessmentId, current, computed, overridden }: { assessmentId: number; current: string; computed: string; overridden: boolean }) {
  const [open, setOpen] = useState(false), router = useRouter(), toast = useToast();
  return (
    <>
      <button type="button" className="btn sm no-print" onClick={() => setOpen(true)}><Icon name="sliders" />Change risk level</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Set risk level" submitLabel="Save decision" onSubmit={async f => {
        const v = formData(f);
        if (!v.level) return "Choose a risk level.";
        const r = await setRiskLevel(assessmentId, { category: v.level === "computed" ? null : v.level, note: v.note });
        if (r.error) return r.error;
        toast(v.level === "computed" ? "Risk level returned to the computed level" : `Risk level set to ${v.level}`);
        router.refresh();
      }}>
        <div className="banner info small"><Icon name="info" /><div>The submitted report and its score stay unchanged. Your decision is recorded with your name and reason, and is shown wherever this report&apos;s risk level appears. The computed level is <b>{computed}</b>.</div></div>
        <div className="levels" role="radiogroup" aria-label="Risk level">
          {LEVELS.map(([k, l]) => (
            <label key={k} className={k}><input type="radio" name="level" value={k} defaultChecked={k === current} required /><b>{k}</b><span>{l}</span></label>
          ))}
          {overridden && <label className="computed"><input type="radio" name="level" value="computed" /><b>Computed</b><span>Back to {computed}</span></label>}
        </div>
        <label className="f"><span>Reason</span><textarea name="note" required placeholder="Evidence or judgement behind this level" /></label>
      </Modal>
    </>
  );
}

const OUTCOMES =["Note", "Verified - Confirmed", "Verified - Not Substantiated", "Correction Recorded", "Resolved"];

export function AddReview({ assessmentId, items }: { assessmentId: number; items: { id: number; text: string; status: Status | null; alert: boolean }[] }) {
  const [open, setOpen] = useState(false), router = useRouter(), toast = useToast();
  const flagged = items.filter(i => i.status === "N" || i.status === "P"), rest = items.filter(i => !flagged.includes(i));
  return (
    <>
      <button type="button" className="btn sm no-print" onClick={() => setOpen(true)}><Icon name="plus" />Add note</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add verification note" submitLabel="Add note" onSubmit={async f => {
        const v = formData(f);
        const r = await addReview(assessmentId, { criterion_id: v.criterion_id ? Number(v.criterion_id) : null, outcome: v.outcome, note: v.note, corrected_status: v.corrected_status || null });
        if (r.error) return r.error;
        toast("Verification note added");
        router.refresh();
      }}>
        <div className="banner info small"><Icon name="info" /><div>This note is stored separately. The original submitted responses and score are preserved unchanged.</div></div>
        <label className="f"><span>Criterion (optional)</span><select name="criterion_id" defaultValue="">
          <option value="">Whole report</option>
          <optgroup label="Reported violations">{flagged.map(i => <option key={i.id} value={i.id}>{i.alert ? "[Critical alert] " : ""}{i.text} ({STATUS_LABEL[i.status!]})</option>)}</optgroup>
          <optgroup label="Other criteria">{rest.map(i => <option key={i.id} value={i.id}>{i.text}</option>)}</optgroup>
        </select></label>
        <label className="f"><span>Outcome</span><select name="outcome">{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select></label>
        <label className="f"><span>Corrected status (only for &quot;Correction Recorded&quot;)</span><select name="corrected_status" defaultValue="">
          <option value="">—</option>{(Object.keys(STATUS_LABEL) as Status[]).map(k => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}</select></label>
        <label className="f"><span>Note</span><textarea name="note" required placeholder="Evidence reviewed, persons contacted, conclusion" /></label>
      </Modal>
    </>
  );
}
