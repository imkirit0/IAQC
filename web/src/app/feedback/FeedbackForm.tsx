"use client";
import { useRef, useState, type ReactNode } from "react";
import { submitFeedback } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { FB_MAX_TOTAL_MB, validateAnswers, type FbForm, type FbQuestion } from "@/lib/feedback";

const Title = ({ q }: { q: FbQuestion }) => <>{q.title}{q.required && <span className="req" aria-hidden="true"> *</span>}</>;
const Help = ({ q }: { q: FbQuestion }) => q.help ? <div className="help">{q.help}</div> : null;
const Ends = ({ q }: { q: FbQuestion }) => q.minLabel || q.maxLabel ? <div className="fb-ends"><span>{q.minLabel}</span><span>{q.maxLabel}</span></div> : null;

/** The form as students see it. In preview it validates the same way but sends nothing. */
export function FeedbackForm({ form, version, ticket, preview }: { form: FbForm; version?: number; ticket?: string; preview?: boolean }) {
  const [vals, setVals] = useState<Record<string, string | string[]>>({}), [files, setFiles] = useState<Record<string, File | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string>>({}), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const trap = useRef<HTMLInputElement>(null), sending = useRef(false); // sending blocks a second tap before the button has redrawn as disabled

  const set = (id: string, v: string | string[]) => {
    setVals(p => ({ ...p, [id]: v }));
    setNotice("");
    setErrors(p => { const n = { ...p }; delete n[id]; return n; });
  };
  function showErrors(e: Record<string, string>) {
    setErrors(e);
    const first = form.items.find(i => e[i.id]);
    if (first) requestAnimationFrame(() => document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function submit() {
    if (sending.current) return;
    const raw: Record<string, unknown> = { ...vals };
    Object.entries(files).forEach(([id, f]) => { if (f) raw[id] = { name: f.name, size: f.size }; });
    const { errors: e } = validateAnswers(form, raw);
    setNotice("");
    if (Object.keys(e).length) { setNotice("Please correct the highlighted questions."); return showErrors(e); }
    const attached = Object.values(files).filter((f): f is File => !!f);
    if (attached.reduce((n, f) => n + f.size, 0) > FB_MAX_TOTAL_MB * 1024 * 1024) return setNotice(`Attached files must total ${FB_MAX_TOTAL_MB} MB or less.`);
    if (preview) return setNotice("Preview only: every answer is valid, and nothing was sent.");

    sending.current = true; setBusy(true);
    const fd = new FormData();
    fd.set("ticket", ticket ?? ""); fd.set("version", String(version)); fd.set("answers", JSON.stringify(vals)); fd.set("website", trap.current?.value ?? "");
    Object.entries(files).forEach(([id, f]) => { if (f) fd.set(`file:${id}`, f); });
    const r = await submitFeedback(fd).catch(() => ({ error: "Your feedback could not be sent. Please check your connection and try again.", ok: undefined, data: undefined }));
    sending.current = false; setBusy(false);
    if (r.ok) { setDone(true); window.scrollTo({ top: 0 }); return; }
    setNotice(r.error ?? "");
    if (r.data?.fields) showErrors(r.data.fields as Record<string, string>);
  }

  if (done) return (
    <div className="card"><div className="bd center" role="status">
      <div className="done-mark"><Icon name="tick" /></div>
      <h1 style={{ marginTop: 0 }}>Thank You for Your Feedback!</h1>
      <p>Your feedback matters to us and helps us continuously improve our services.</p>
      <p>If your feedback requires any further attention or support from our side, our team will get in touch with you soon.</p>
      <p>Thank you for taking the time to share your thoughts.</p>
      <p style={{ fontWeight: 600, marginBottom: 0 }}>Team G-TEC IAQA</p>
    </div></div>
  );

  const field = (q: FbQuestion): ReactNode => {
    const v = vals[q.id], s = typeof v === "string" ? v : "", id = `in-${q.id}`, name = q.id;
    const group = (body: ReactNode) => <fieldset><legend><Title q={q} /></legend><Help q={q} />{body}</fieldset>;
    const single = (body: ReactNode) => <><label className="t" htmlFor={id}><Title q={q} /></label><Help q={q} />{body}</>;
    const input = (type: string, extra: object = {}) => single(<input id={id} type={type} value={s} onChange={e => set(q.id, e.target.value)} aria-required={q.required} {...extra} />);
    switch (q.type) {
      case "short": return input("text", { maxLength: q.max ?? 1000 });
      case "long": return single(<textarea id={id} rows={5} value={s} maxLength={q.max ?? 10000} onChange={e => set(q.id, e.target.value)} aria-required={q.required} />);
      case "email": return input("email", { autoComplete: "email" });
      case "number": return input("number", { inputMode: q.integer ? "numeric" : "decimal", step: q.integer ? 1 : "any", min: q.min ?? undefined, max: q.max ?? undefined });
      case "date": return input("date", { min: q.from || undefined, max: q.to || undefined });
      case "time": return input("time", { min: q.from || undefined, max: q.to || undefined });
      case "dropdown": return single(<select id={id} value={s} onChange={e => set(q.id, e.target.value)} aria-required={q.required}><option value="">Choose</option>{q.options.map(o => <option key={o}>{o}</option>)}</select>);
      case "choice": return group(q.options.map(o => <label key={o} className="check"><input type="radio" name={name} checked={s === o} onChange={() => set(q.id, o)} /> {o}</label>));
      case "checkbox": {
        const picked = Array.isArray(v) ? v : [];
        return group(q.options.map(o => <label key={o} className="check"><input type="checkbox" checked={picked.includes(o)} onChange={e => set(q.id, e.target.checked ? [...picked, o] : picked.filter(x => x !== o))} /> {o}</label>));
      }
      case "scale": {
        const values = Array.from({ length: q.max! - q.min! + 1 }, (_, i) => q.min! + i);
        return group(<><div className="fb-scale">{values.map(n => <label key={n}><input type="radio" name={name} checked={s === String(n)} onChange={() => set(q.id, String(n))} />{n}</label>)}</div><Ends q={q} /></>);
      }
      case "stars":
        return group(<><div className="fb-stars">{Array.from({ length: q.max! }, (_, i) => i + 1).map(n => (
          <label key={n} className={Number(s) >= n ? "on" : ""}><input type="radio" name={name} checked={s === String(n)} onChange={() => set(q.id, String(n))} aria-label={`${n} of ${q.max} stars`} /><Icon name="star" /></label>
        ))}</div><Ends q={q} /></>);
      case "range":
        return single(<>
          <input id={id} type="range" min={q.min!} max={q.max!} step={q.step!} value={s || q.min!} onChange={e => set(q.id, e.target.value)} style={{ padding: 0 }} />
          <div className="fb-ends"><span>{q.minLabel || q.min}</span><b>{s || "Move the slider to answer"}</b><span>{q.maxLabel || q.max}</span></div>
        </>);
      case "file":
        return single(<>
          <input id={id} type="file" accept={q.fileTypes.map(t => `.${t}`).join(",")} onChange={e => { const f = e.target.files?.[0]; setFiles(p => ({ ...p, [q.id]: f })); setNotice(""); setErrors(p => { const n = { ...p }; delete n[q.id]; return n; }); }} />
          <div className="small faint" style={{ marginTop: 4 }}>{q.fileTypes.join(", ")}, up to {q.maxMb} MB</div>
        </>);
    }
  };

  return (
    <div className="card">
      <div className="fb-sec"><h1 style={{ margin: 0 }}>{form.title || "Untitled form"}</h1>
        {form.description && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{form.description}</p>}
        <div className="small faint" style={{ marginTop: 8 }}><span className="req">*</span> Required question</div></div>
      {form.items.map(it => it.kind === "s"
        ? <div key={it.id} className="fb-sec"><h2>{it.title}</h2>{it.help && <p className="small muted" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{it.help}</p>}</div>
        : <div key={it.id} id={`q-${it.id}`} className={`fb-q${errors[it.id] ? " bad" : ""}`}>{field(it)}{errors[it.id] && <div className="err" role="alert">{errors[it.id]}</div>}</div>)}
      <div className="fb-trap" aria-hidden="true"><label>Website<input ref={trap} name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="bd">
        {notice && <div className="err" role="alert" style={{ marginBottom: 10 }}>{notice}</div>}
        <button type="button" className={`btn primary${busy ? " loading" : ""}`} disabled={busy} onClick={submit}>Submit feedback</button>
      </div>
    </div>
  );
}
