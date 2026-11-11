"use client";
import { Reorder, useDragControls } from "motion/react";
import { useEffect, useState } from "react";
import { publishFeedback, saveFeedbackDraft, setFeedbackActive } from "@/app/actions";
import { FeedbackForm } from "@/app/feedback/FeedbackForm";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { blankQuestion, cleanForm, FB_FILE_TYPES, FB_MAX_TOTAL_MB, FB_TYPES, fbId, formErrors, hasOptions, type FbForm, type FbItem, type FbQuestion, type FbType } from "@/lib/feedback";

const Num = ({ label, value, onChange, min, max, step }: { label: string; value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number | "any" }) => (
  <label className="f"><span>{label}</span><input type="number" value={value ?? ""} min={min} max={max} step={step ?? "any"} onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))} /></label>
);
const Txt = ({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) => (
  <label className="f"><span>{label}</span><input type={type} value={value} maxLength={80} onChange={e => onChange(e.target.value)} /></label>
);

/** The settings that belong to one question type. */
function Rules({ q, set }: { q: FbQuestion; set: (p: Partial<FbQuestion>) => void }) {
  const move = (i: number, by: number) => { const o = [...q.options]; [o[i], o[i + by]] = [o[i + by], o[i]]; set({ options: o }); };
  const labels = <><Txt label="Low-end label (optional)" value={q.minLabel} onChange={minLabel => set({ minLabel })} /><Txt label="High-end label (optional)" value={q.maxLabel} onChange={maxLabel => set({ maxLabel })} /></>;
  return (
    <>
      {hasOptions(q.type) && <div style={{ marginBottom: 12 }}>
        <div className="small muted" style={{ fontWeight: 600, marginBottom: 5 }}>Answer options</div>
        {q.options.map((o, i) => (
          <div key={i} className="fb-opt">
            <input value={o} maxLength={300} aria-label={`Option ${i + 1}`} onChange={e => set({ options: q.options.map((x, j) => j === i ? e.target.value : x) })} />
            <button type="button" className="btn sm quiet" disabled={!i} aria-label="Move option up" onClick={() => move(i, -1)}><Icon name="up" /></button>
            <button type="button" className="btn sm quiet" disabled={i === q.options.length - 1} aria-label="Move option down" onClick={() => move(i, 1)}><Icon name="down" /></button>
            <button type="button" className="btn sm quiet" aria-label="Remove option" onClick={() => set({ options: q.options.filter((_, j) => j !== i) })}><Icon name="close" /></button>
          </div>
        ))}
        <button type="button" className="btn sm" onClick={() => set({ options: [...q.options, `Option ${q.options.length + 1}`] })}><Icon name="plus" />Add option</button>
      </div>}
      <div className="fb-grid">
        {q.type === "checkbox" && <><Num label="Minimum selections" value={q.min} min={0} step={1} onChange={min => set({ min })} /><Num label="Maximum selections" value={q.max} min={1} step={1} onChange={max => set({ max })} /></>}
        {(q.type === "short" || q.type === "long") && <><Num label="Minimum characters" value={q.min} min={0} step={1} onChange={min => set({ min })} /><Num label="Maximum characters" value={q.max} min={1} step={1} onChange={max => set({ max })} /></>}
        {q.type === "number" && <><Num label="Minimum value" value={q.min} onChange={min => set({ min })} /><Num label="Maximum value" value={q.max} onChange={max => set({ max })} /></>}
        {q.type === "range" && <><Num label="Minimum value" value={q.min} onChange={min => set({ min })} /><Num label="Maximum value" value={q.max} onChange={max => set({ max })} /><Num label="Step" value={q.step} onChange={step => set({ step })} />{labels}</>}
        {q.type === "scale" && <>
          <label className="f"><span>From</span><select value={q.min ?? 1} onChange={e => set({ min: Number(e.target.value) })}><option>0</option><option>1</option></select></label>
          <label className="f"><span>To</span><select value={q.max ?? 5} onChange={e => set({ max: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n}>{n}</option>)}</select></label>{labels}</>}
        {q.type === "stars" && <><label className="f"><span>Number of stars</span><select value={q.max ?? 5} onChange={e => set({ max: Number(e.target.value) })}>{[3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n}>{n}</option>)}</select></label>{labels}</>}
        {q.type === "date" && <><Txt type="date" label="Earliest date (optional)" value={q.from} onChange={from => set({ from })} /><Txt type="date" label="Latest date (optional)" value={q.to} onChange={to => set({ to })} /></>}
        {q.type === "time" && <><Txt type="time" label="Earliest time (optional)" value={q.from} onChange={from => set({ from })} /><Txt type="time" label="Latest time (optional)" value={q.to} onChange={to => set({ to })} /></>}
        {q.type === "file" && <Num label={`Maximum file size (MB, up to ${FB_MAX_TOTAL_MB})`} value={q.maxMb} min={0.1} max={FB_MAX_TOTAL_MB} onChange={maxMb => set({ maxMb: maxMb ?? 0 })} />}
      </div>
      {q.type === "number" && <label className="check"><input type="checkbox" checked={q.integer} onChange={e => set({ integer: e.target.checked })} /> Whole numbers only</label>}
      {q.type === "email" && <p className="small faint">The email format is checked automatically.</p>}
      {q.type === "file" && <div style={{ marginBottom: 12 }}>
        <div className="small muted" style={{ fontWeight: 600, marginBottom: 5 }}>Allowed file types</div>
        <div className="fb-types">{FB_FILE_TYPES.map(t => <label key={t} className="check"><input type="checkbox" checked={q.fileTypes.includes(t)} onChange={e => set({ fileTypes: e.target.checked ? [...q.fileTypes, t] : q.fileTypes.filter(x => x !== t) })} /> {t}</label>)}</div>
      </div>}
    </>
  );
}

/** One draggable block. Dragging starts only from the grip, so typing and selecting text inside the fields keep working. */
function ItemCard({ item, label, first, last, change, remove, move }: { item: FbItem; label: string; first: boolean; last: boolean; change: (i: FbItem) => void; remove: () => void; move: (by: number) => void }) {
  const drag = useDragControls();
  const set = (p: Partial<FbQuestion>) => change({ ...item, ...p } as FbItem);
  function retype(type: FbType) {
    const q = item as FbQuestion;
    change({ ...blankQuestion(type, q.id), title: q.title, help: q.help, required: q.required, ...(hasOptions(type) && hasOptions(q.type) ? { options: q.options } : {}) });
  }
  return (
    <Reorder.Item value={item.id} dragListener={false} dragControls={drag} className="fb-item">
      <div className="top">
        <span className="fb-grip" onPointerDown={e => drag.start(e)} title="Drag to reorder" aria-hidden="true"><Icon name="grip" /></span>
        <b className="small">{label}</b>
        {item.kind === "q" && <select value={item.type} aria-label="Question type" style={{ width: "auto" }} onChange={e => retype(e.target.value as FbType)}>{Object.entries(FB_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
        <span className="spacer" />
        {item.kind === "q" && <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={item.required} onChange={e => set({ required: e.target.checked })} /> Mandatory</label>}
        <button type="button" className="btn sm quiet" disabled={first} aria-label="Move up" onClick={() => move(-1)}><Icon name="up" /></button>
        <button type="button" className="btn sm quiet" disabled={last} aria-label="Move down" onClick={() => move(1)}><Icon name="down" /></button>
        <button type="button" className="btn sm quiet" aria-label="Remove" onClick={remove}><Icon name="close" /></button>
      </div>
      <div className="body">
        <label className="f"><span>{item.kind === "q" ? "Question" : "Section heading"}</span><input value={item.title} maxLength={1000} onChange={e => set({ title: e.target.value })} /></label>
        <label className="f"><span>{item.kind === "q" ? "Description or instructions (optional)" : "Section description (optional)"}</span><textarea rows={2} value={item.help} maxLength={2000} onChange={e => set({ help: e.target.value })} /></label>
        {item.kind === "q" && <Rules q={item} set={set} />}
      </div>
    </Reorder.Item>
  );
}

/** The single feedback form: edits stay in a draft until published, so students only ever see a finished version at the same link. */
export function FormBuilder({ draft, published, version, active, link, qr }: { draft: FbForm; published: FbForm | null; version: number | null; active: boolean; link: string; qr: string }) {
  const toast = useToast();
  const [form, setForm] = useState(draft), [preview, setPreview] = useState(false), [problems, setProblems] = useState<string[]>([]), [busy, setBusy] = useState(false), [add, setAdd] = useState<FbType>("short");
  const clean = JSON.stringify(cleanForm(form)), unsaved = clean !== JSON.stringify(draft), unpublished = clean !== JSON.stringify(published);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const items = (fn: (i: FbItem[]) => FbItem[]) => { setForm(f => ({ ...f, items: fn(f.items) })); setProblems([]); };
  const move = (i: number, by: number) => items(l => { const n = [...l]; [n[i], n[i + by]] = [n[i + by], n[i]]; return n; });
  const byId = new Map(form.items.map(i => [i.id, i]));
  let qNo = 0;

  async function act(fn: () => Promise<{ error?: string }>, done: string) {
    setBusy(true);
    const r = await fn().catch(() => ({ error: "Something went wrong. Please try again." }));
    setBusy(false);
    toast(r.error ?? done, !!r.error);
  }
  function publish() {
    const errs = formErrors(cleanForm(form));
    setProblems(errs);
    if (errs.length) return;
    if (window.confirm("Publish these changes? Students will see them at the same link straight away. Responses already received keep their original questions.")) act(() => publishFeedback(form), "Published to students");
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}><div className="bd">
        <div className="row" style={{ alignItems: "flex-start", gap: 18 }}>
          <div className="fb-qr" role="img" aria-label="QR code for the feedback link" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="fb-link">
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <b>Public link</b>
              <span className={`chip ${active ? "ok" : ""}`}>{active ? "Collecting feedback" : "Closed"}</span>
              <span className="small faint">{version ? `Live version ${version}` : "Not published yet"}</span>
            </div>
            <input readOnly value={link} aria-label="Public feedback link" onFocus={e => e.target.select()} style={{ marginBottom: 10 }} />
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm primary" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Link copied"), () => toast("Select the link and copy it", true))}>Copy link</button>
              <a className="btn sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Please share your feedback: ${link}`)}`}>WhatsApp</a>
              <a className="btn sm" href={`mailto:?subject=${encodeURIComponent("Share your feedback")}&body=${encodeURIComponent(`Please share your feedback: ${link}`)}`}>Email</a>
              <a className="btn sm" download="feedback-qr.svg" href={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`}><Icon name="down" />QR code</a>
              <span className="spacer" />
              <button type="button" className={`btn sm${active ? "" : " primary"}`} disabled={busy} onClick={() => act(() => setFeedbackActive(!active), active ? "Collection closed" : "Collection opened")}>{active ? "Close collection" : "Open collection"}</button>
            </div>
          </div>
        </div>
      </div></div>

      {problems.length > 0 && <div className="banner warn" role="alert"><Icon name="alert" /><div><b>Before publishing:</b><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{problems.map(p => <li key={p}>{p}</li>)}</ul></div></div>}

      <div className="card" style={{ marginBottom: 12 }}><div className="bd">
        <label className="f"><span>Form title</span><input value={form.title} maxLength={200} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
        <label className="f" style={{ marginBottom: 0 }}><span>Form description (optional)</span><textarea rows={2} value={form.description} maxLength={4000} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      </div></div>

      <Reorder.Group axis="y" values={form.items.map(i => i.id)} onReorder={(ids: string[]) => items(() => ids.map(id => byId.get(id)!))} style={{ margin: 0, padding: 0 }}>
        {form.items.map((it, i) => (
          <ItemCard key={it.id} item={it} label={it.kind === "s" ? "Section" : `Question ${++qNo}`} first={!i} last={i === form.items.length - 1} move={by => move(i, by)}
            change={n => items(l => l.map(x => x.id === n.id ? n : x))} remove={() => { if (window.confirm(`Remove this ${it.kind === "s" ? "section" : "question"} from the form?`)) items(l => l.filter(x => x.id !== it.id)); }} />
        ))}
      </Reorder.Group>
      {!form.items.length && <div className="card" style={{ marginBottom: 12 }}><div className="empty"><b>No questions yet</b>Add the first question below.</div></div>}

      <div className="card"><div className="bd row" style={{ gap: 8 }}>
        <select value={add} onChange={e => setAdd(e.target.value as FbType)} aria-label="Type of question to add" style={{ width: "auto" }}>{Object.entries(FB_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button type="button" className="btn" onClick={() => items(l => [...l, blankQuestion(add)])}><Icon name="plus" />Add question</button>
        <button type="button" className="btn" onClick={() => items(l => [...l, { id: fbId(), kind: "s", title: "", help: "" }])}><Icon name="plus" />Add section</button>
        <span className="spacer" />
        <span className="small faint">{unsaved ? "Unsaved changes" : unpublished ? "Saved, not yet published" : "Up to date"}</span>
        <button type="button" className="btn" onClick={() => setPreview(true)}>Preview</button>
        <button type="button" className="btn" disabled={busy || !unsaved} onClick={() => act(() => saveFeedbackDraft(form), "Draft saved")}>Save draft</button>
        <button type="button" className="btn primary" disabled={busy || !unpublished} onClick={publish}>Publish</button>
      </div></div>

      <Modal open={preview} onClose={() => setPreview(false)} wide title="Preview: what students will see"><FeedbackForm form={cleanForm(form)} preview /></Modal>
    </>
  );
}
