"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { locate, useHydrated, type Fix } from "@/lib/client";
import { submitAssessment } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Providers";
import { needsRemark, STATUS_LABEL, type SnapCriterion, type Snapshot, type Status } from "@/lib/scoring";
import { today } from "@/lib/format";
import { draftKey, dropDraft, loadDraft, saveDraft, type Draft } from "../draft";

type CentreInfo = { id: number; name: string; code: string; location: string; district: string };
const OPTIONS: Status[] = ["C", "P", "N", "NA"];
const EASE = [0.16, 1, 0.3, 1] as const;

type Props = { userId: string; centre: CentreInfo; snap: Snapshot; gpsRequired: boolean };

// The draft lives in browser storage, so the form renders only after hydration.
export function VisitForm(props: Props) {
  return useHydrated() ? <Form {...props} /> : <div className="ac-wrap"><div className="skel" style={{ height: 40, width: 320, marginBottom: 16 }} /><div className="skel" style={{ height: 420 }} /></div>;
}

function Form({ userId, centre, snap, gpsRequired }: Props) {
  const router = useRouter(), toast = useToast();
  const key = draftKey(userId, centre.id);
  const secs = snap.sections, crits = useMemo(() => secs.flatMap(s => s.criteria), [secs]);
  // Resume the device draft; keep answers if the checklist version moved on.
  const [d, setD] = useState<Draft>(() => {
    const base: Draft = loadDraft(key) ?? { version: snap.version, date: today(), responses: {}, general: "", step: 0 };
    return base.version === snap.version ? base : { ...base, version: snap.version, changed: true, step: 0 };
  });
  const [dirn, setDirn] = useState(1), [busy, setBusy] = useState(false), [locErr, setLocErr] = useState(""), [reason, setReason] = useState("");
  useEffect(() => saveDraft(key, d), [d, key]);

  const answered = (c: SnapCriterion) => {
    const r = d.responses[c.id];
    return !!r?.status && !(needsRemark(c, r.status) && !(r.remark ?? "").trim()) && !(c.mandatory && r.status === "NA");
  };
  const done = crits.filter(answered).length, total = crits.length, isReview = d.step === secs.length;
  const secDone = (i: number) => secs[i].criteria.every(answered);
  const go = (step: number) => { setDirn(step > d.step ? 1 : -1); setD({ ...d, step }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const setResp = (id: number, patch: { status?: Status; remark?: string }) => setD({ ...d, responses: { ...d.responses, [id]: { ...d.responses[id], ...patch } } });

  async function submit(withoutLocation = false) {
    setBusy(true);
    let gps: Fix | null = null;
    if (!withoutLocation) {
      try { gps = await locate(); setLocErr(""); }
      catch (e) { setBusy(false); setLocErr((e as Error).message); return; }
    }
    const r = await submitAssessment({ centre_id: centre.id, visit_date: d.date, responses: d.responses, general_remarks: d.general, checklist_version: d.version, gps, gps_reason: withoutLocation ? reason : undefined });
    setBusy(false);
    if (r.error) {
      // Answers stay in the draft; a rejected location only needs recapturing.
      if (/captured location/i.test(r.error)) return setLocErr(r.error.replace(/ Capture it again\.$/, ""));
      toast(r.error, true);
      if (/checklist was updated/i.test(r.error)) router.refresh();
      return;
    }
    dropDraft(key);
    try { sessionStorage.setItem("rds-last", JSON.stringify({ ...r.data, centre: centre.name, centre_id: centre.id, code: centre.code, date: d.date, located: !!gps })); } catch { /* ignore */ }
    router.push("/visits/done");
  }

  return (
    <div className="ac-wrap">
      <div className="ph" style={{ marginBottom: 8 }}>
        <div className="grow">
          <Link href="/visits" className="back"><Icon name="left" />My centres</Link>
          <div className="code">{centre.code}</div>
          <h1 style={{ marginTop: 4 }}>{centre.name}</h1>
          <div className="sub">{centre.location}, {centre.district}</div>
        </div>
        <label className="f" style={{ margin: 0, minWidth: 170 }}><span>Visit date</span>
          <input type="date" value={d.date} max={today()} onChange={e => setD({ ...d, date: e.target.value })} /></label>
      </div>

      {d.changed && <div className="banner warn small"><Icon name="info" /><div>The checklist was updated since this draft was started. Your answers were kept. Please check every section before submitting.</div></div>}

      <div className="sticky-prog">
        <div className="row small" style={{ marginBottom: 8 }}><b>{done} of {total} criteria completed</b><span className="spacer" /><span className="faint">{Math.round((done / total) * 100)}%</span></div>
        <div className="progress"><motion.i animate={{ width: `${(done / total) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 22 }} /></div>
        <div className="steps" style={{ marginTop: 12 }}>
          {secs.map((s, i) => (
            <button key={s.id} className={i === d.step ? "on" : secDone(i) ? "done" : ""} onClick={() => go(i)}>
              <AnimatePresence initial={false}>{secDone(i) && <motion.span initial={{ scale: 0, width: 0 }} animate={{ scale: 1, width: "auto" }} exit={{ scale: 0, width: 0 }} style={{ display: "inline-flex" }}><Icon name="tick" /></motion.span>}</AnimatePresence>
              {s.name}
            </button>
          ))}
          <button className={isReview ? "on" : ""} onClick={() => go(secs.length)}>Review &amp; submit</button>
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dirn} initial={false}>
        <motion.div key={d.step} custom={dirn}
          variants={{ enter: (x: number) => ({ opacity: 0, x: 28 * x }), center: { opacity: 1, x: 0 }, exit: (x: number) => ({ opacity: 0, x: -28 * x }) }}
          initial="enter" animate="center" exit="exit" transition={{ duration: 0.32, ease: EASE }}>
          {isReview ? review() : sectionStep()}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  function sectionStep() {
    const s = secs[d.step];
    return (
      <>
        <div className="row" style={{ margin: "10px 0 14px", alignItems: "baseline" }}><h2 className="grow">{s.name}</h2><span className="small faint">Section {d.step + 1} of {secs.length}</span></div>
        {s.criteria.map(c => {
          const r = d.responses[c.id] ?? {}, req = !!r.status && needsRemark(c, r.status);
          return (
            <div key={c.id} className={`crit-card${r.status && !answered(c) ? " missing" : ""}`}>
              <div className="q">{c.text}</div>
              {c.description && <details className="small muted" style={{ marginTop: 2 }}><summary>Guidelines</summary>{c.description}</details>}
              <div className="opts" role="radiogroup" aria-label={c.text}>
                {OPTIONS.map(k => {
                  const dis = k === "NA" && c.mandatory, on = r.status === k;
                  return (
                    <label key={k} className={`${k}${dis ? " disabled" : ""}`} title={dis ? "Mandatory criteria cannot be marked Not Applicable" : undefined}>
                      <input type="radio" name={`r-${c.id}`} value={k} checked={on} disabled={dis} onChange={() => setResp(c.id, { status: k })} />
                      {on && <motion.span layoutId={`opt-${c.id}`} className={`opt-ind ${k}`} transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
                      <span style={{ position: "relative" }}>{STATUS_LABEL[k]}</span>
                    </label>
                  );
                })}
              </div>
              <label className="small" style={{ display: "block" }}>
                <span className="muted" style={{ fontWeight: 600 }}>Remarks and observations</span>{" "}
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={req ? "r" : "o"} className={req ? "req" : "faint"} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{req ? "Required" : "Optional"}</motion.span>
                </AnimatePresence>
                <textarea style={{ marginTop: 5 }} value={r.remark ?? ""} onChange={e => setResp(c.id, { remark: e.target.value })}
                  placeholder={req ? "What was observed, the evidence seen, and who was present" : "Add an observation"} />
              </label>
            </div>
          );
        })}
        <div className="row" style={{ marginTop: 18 }}>
          {d.step > 0 && <button className="btn" onClick={() => go(d.step - 1)}><Icon name="left" />Previous</button>}
          <span className="spacer" />
          <button className="btn primary" onClick={() => go(d.step + 1)}>{d.step === secs.length - 1 ? "Review report" : "Next section"}<Icon name="right" /></button>
        </div>
      </>
    );
  }

  function review() {
    const missing = crits.filter(c => !answered(c));
    const cnt: Record<Status, number> = { C: 0, P: 0, N: 0, NA: 0 };
    crits.forEach(c => { const s = d.responses[c.id]?.status as Status | undefined; if (s) cnt[s]++; });
    return (
      <div className="card">
        <div className="hd"><h2>Final review</h2></div>
        <div className="bd">
          {missing.length
            ? <div className="banner warn"><Icon name="alert" /><div><b>{missing.length} item{missing.length === 1 ? " needs" : "s need"} attention before submission.</b><br />Every criterion must be answered. Remarks are required for Non-Compliant responses, and for Partially Compliant responses where the form marks them Required.</div></div>
            : <div className="banner info"><Icon name="tick" /><div>All criteria are complete. Check your answers below, then submit.</div></div>}
          <div className="row small" style={{ gap: 18, marginBottom: 14 }}>{OPTIONS.map(k => <span key={k} className={`st-${k}`}>{STATUS_LABEL[k]}: {cnt[k]}</span>)}</div>
          {secs.map((s, i) => (
            <div key={s.id}>
              <div className="row" style={{ margin: "16px 0 6px" }}><h3 className="grow">{s.name}</h3><button className="btn sm quiet" onClick={() => go(i)}>Edit</button></div>
              <div className="tw"><table className="review-table"><colgroup><col /><col style={{ width: 170 }} /><col style={{ width: "34%" }} /></colgroup><tbody>{s.criteria.map(c => {
                const r = d.responses[c.id] ?? {};
                return (
                  <tr key={c.id} className={answered(c) ? "" : "alert-row"}>
                    <td>{c.text}</td>
                    <td className="nowrap">{r.status ? <span className={`st-${r.status}`}>{STATUS_LABEL[r.status as Status]}</span> : <span className="req">Not answered</span>}</td>
                    <td className="small muted">{r.remark}{r.status && !answered(c) && <div className="req">Remark required</div>}</td>
                  </tr>
                );
              })}</tbody></table></div>
            </div>
          ))}
          <label className="f mt"><span>General remarks (optional)</span><textarea value={d.general} onChange={e => setD({ ...d!, general: e.target.value })} /></label>
          {locErr ? (
            <div className="banner warn"><Icon name="alert" /><div><b>Your location was not captured.</b> {locErr} Your answers are kept.
              {!gpsRequired && <label className="f" style={{ margin: "12px 0 0" }}><span>Or submit without location. The report will be marked location unverified. Reason</span>
                <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. no GPS signal inside the building" /></label>}
            </div></div>
          ) : <p className="small muted row" style={{ gap: 6 }}><Icon name="pin" />Your current location is recorded with the report when you submit{gpsRequired ? ", and is required" : ""}.</p>}
          <div className="row">
            <span className="small faint">Once submitted, this report is final and cannot be edited.</span><span className="spacer" />
            {locErr && !gpsRequired && <button className="btn" disabled={!!missing.length || busy || !reason.trim()} onClick={() => submit(true)}>Submit without location</button>}
            <button className={`btn primary${busy ? " loading" : ""}`} disabled={!!missing.length || busy} onClick={() => submit()}>{locErr ? "Recapture location and submit" : "Submit visit report"}</button>
          </div>
        </div>
      </div>
    );
  }
}
