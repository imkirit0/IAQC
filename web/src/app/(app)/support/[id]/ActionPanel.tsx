"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supportAction, type SupportInput } from "@/app/actions";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { ACTIONS, type ActionName } from "@/lib/support";
import { today } from "@/lib/format";

type Props = {
  id: number; actions: ActionName[]; training: boolean; departments: string[]; users: { id: string; name: string; department: string | null; district: string | null }[];
  current: { department: string; assignee_id: string | null; response_due: string | null; completion_due: string | null };
};
const PRIMARY: ActionName[] = ["assign", "accept", "complete", "verify", "respond"];
const NOTE_LABEL: Partial<Record<ActionName, string>> = {
  clarify: "What needs clarifying", respond: "Your answer", reject: "Reason for rejecting", hold: "Reason for putting on hold", cancel: "Reason for cancelling",
  reassign: "Reason for reassigning", deadlines: "Reason for changing the deadlines", return: "What still needs to be done", progress: "Progress, actions taken and any obstacles",
};
// datetime-local works in the viewer's local time; deadlines are stored as absolute instants.
const toLocal = (iso: string | null) => (iso ? new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "");
const toIso = (v: string) => (v ? new Date(v).toISOString() : "");

export function ActionPanel({ id, actions, training, departments, users, current }: Props) {
  const router = useRouter(), toast = useToast();
  const [open, setOpen] = useState<ActionName | null>(null), [dept, setDept] = useState(current.department);
  const def = open ? ACTIONS[open] : null;
  const assigning = open === "assign" || open === "reassign";

  async function submit(f: HTMLFormElement) {
    const v = formData(f);
    const input: SupportInput = { note: v.note, department: v.department, assignee_id: v.assignee_id, response_due: toIso(v.response_due), completion_due: toIso(v.completion_due),
      estimated_completion: v.estimated_completion,
      delivery: open === "complete" ? { date: v.d_date, description: v.d_description, topic: v.d_topic, mode: v.d_mode, participants: v.d_participants, outcome: v.d_outcome } : undefined };
    const r = await supportAction(id, open!, input);
    if (r.error) return r.error;
    toast(`${ACTIONS[open!].label}: done`);
    router.refresh();
  }

  return (
    <>
      <div className="actions">{actions.map(a => (
        <button key={a} className={`btn sm${PRIMARY.includes(a) ? " primary" : ""}`} onClick={() => { setDept(current.department); setOpen(a); }}>{ACTIONS[a].label}</button>
      ))}</div>
      <Modal open={!!open} onClose={() => setOpen(null)} title={def?.label ?? ""} submitLabel={def?.label} wide={open === "complete"} onSubmit={submit}>
        {open && <>
          {assigning && <>
            <div className="grid2">
              <label className="f"><span>Department</span><select name="department" required value={dept} onChange={e => setDept(e.target.value)}>
                {!departments.includes(dept) && <option value={dept} disabled>{dept}</option>}{departments.map(d => <option key={d}>{d}</option>)}</select></label>
              <label className="f"><span>In-charge</span><select name="assignee_id" defaultValue={current.assignee_id ?? ""} key={dept}>
                <option value="">Any in-charge of the department</option>{users.filter(u => u.department === dept).map(u => <option key={u.id} value={u.id}>{u.name}{u.district ? ` (${u.district})` : " (all districts)"}</option>)}</select></label>
            </div>
            {!users.some(u => u.department === dept) && <p className="small faint" style={{ marginTop: -6 }}>No in-charge of this department covers this centre&apos;s district yet. Create one under Users.</p>}
          </>}
          {(assigning || open === "deadlines") && (
            <div className="grid2">
              <label className="f"><span>Respond by</span><input type="datetime-local" name="response_due" required defaultValue={toLocal(current.response_due)} /></label>
              <label className="f"><span>Complete by (optional)</span><input type="datetime-local" name="completion_due" defaultValue={toLocal(current.completion_due)} /></label>
            </div>
          )}
          {open === "progress" && <label className="f"><span>Estimated completion date (optional)</span><input type="date" name="estimated_completion" min={today()} /></label>}
          {open === "complete" && <>
            <div className="grid2">
              <label className="f"><span>Date delivered</span><input type="date" name="d_date" required max={today()} defaultValue={today()} /></label>
              {training && <label className="f"><span>Delivery mode</span><select name="d_mode" required defaultValue=""><option value="" disabled>Choose</option>{["In person", "Online", "Hybrid"].map(m => <option key={m}>{m}</option>)}</select></label>}
            </div>
            {training && <>
              <label className="f"><span>Training topic</span><input name="d_topic" required maxLength={200} /></label>
              <label className="f"><span>Participants / staff covered</span><input name="d_participants" required maxLength={500} placeholder="e.g. 4 faculty: names or roles" /></label>
            </>}
            <label className="f"><span>Support actually provided</span><textarea name="d_description" required minLength={20} rows={5} placeholder="What was done, by whom, and with what material" /></label>
            <label className="f"><span>Outcome</span><textarea name="d_outcome" required rows={3} /></label>
          </>}
          <label className="f"><span>{NOTE_LABEL[open] ?? "Note (optional)"}</span><textarea name="note" required={!!(def && "reason" in def)} rows={3} /></label>
        </>}
      </Modal>
    </>
  );
}
