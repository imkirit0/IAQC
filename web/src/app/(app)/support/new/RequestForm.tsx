"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "motion/react";
import { createSupportRequest } from "@/app/actions";
import { formData } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { ref, today } from "@/lib/format";
import { tryLocate } from "@/lib/client";
import { CATEGORIES, SR_PRIORITIES } from "@/lib/support";

type Props = { centres: { id: number; code: string; name: string }[]; departments: string[]; centreId: number | null; visitId: number | null };

export function RequestForm({ centres, departments, centreId, visitId }: Props) {
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState<{ id: number; reference: string } | null>(null);
  const linked = visitId && centres.some(c => c.id === centreId) ? visitId : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formData(e.currentTarget);
    setBusy(true);
    const r = await createSupportRequest({ centre_id: Number(v.centre_id), assessment_id: linked, department: v.department, category: v.category, title: v.title,
      remarks: v.remarks, priority: v.priority, preferred_date: v.preferred_date, ...await tryLocate() });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setErr(""); setDone(r.data as { id: number; reference: string });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) return (
    <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}><div className="bd center" style={{ padding: "40px 28px" }}>
      <h2>Request submitted</h2>
      <p className="muted" style={{ margin: "10px auto 18px", maxWidth: "44ch" }}>It is now with the IAQA Coordinator for assignment. You will see each update under My support requests.</p>
      <p className="big-score" style={{ fontSize: 30 }}>{done.reference}</p>
      <div className="row" style={{ justifyContent: "center", marginTop: 22 }}>
        <Link className="btn primary" href={`/support/${done.id}`}>View request<Icon name="right" /></Link>
        <Link className="btn" href="/support">All my requests</Link>
      </div>
    </div></motion.div>
  );

  return (
    <form className="card" onSubmit={submit}><div className="bd">
      {linked && <div className="banner info small"><Icon name="info" /><div>Linked to visit report {ref(linked)}.</div></div>}
      <label className="f"><span>Centre</span>
        <select name="centre_id" required defaultValue={centreId && centres.some(c => c.id === centreId) ? centreId : ""} disabled={!!linked}>
          <option value="" disabled>Choose a centre</option>{centres.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
        </select>
        {linked && <input type="hidden" name="centre_id" value={centreId!} />}
      </label>
      <div className="grid2">
        <label className="f"><span>Department</span><select name="department" required defaultValue=""><option value="" disabled>Choose a department</option>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
        <label className="f"><span>Support category</span><select name="category" required defaultValue=""><option value="" disabled>Choose a category</option>{CATEGORIES.map(d => <option key={d}>{d}</option>)}</select></label>
      </div>
      <label className="f"><span>Title</span><input name="title" required maxLength={120} placeholder="e.g. Faculty training on the new DCA syllabus" /></label>
      <label className="f"><span>Detailed remarks</span>
        <textarea name="remarks" required minLength={20} maxLength={4000} rows={7}
          placeholder="What support or training is needed, why, relevant background, topics to cover, staff who need it, and the outcome you expect." /></label>
      <div className="grid2">
        <label className="f"><span>Priority</span><select name="priority" defaultValue="Normal">{SR_PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></label>
        <label className="f"><span>Preferred support date (optional)</span><input type="date" name="preferred_date" min={today()} /></label>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="row"><span className="small faint">Your request is recorded as submitted, with your current location, and cannot be edited afterwards.</span><span className="spacer" />
        <button className={`btn primary${busy ? " loading" : ""}`} disabled={busy}>Submit request</button></div>
    </div></form>
  );
}
