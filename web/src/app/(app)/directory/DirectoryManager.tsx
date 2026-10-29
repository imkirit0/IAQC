"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DirChange, DirEntry } from "@/lib/data";
import { DIRECTORY, type DirKind } from "@/lib/support";
import { deleteDirEntry, reviewDirChange, saveDirEntry } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { PageHead } from "@/components/ui";
import { fmtDT } from "@/lib/format";

const KINDS: DirKind[] = ["trainer", "placement"]; // the PRO list is retired: its rows stay in the database, hidden
const STATUS_BADGE = { Pending: "b-yellow", Verified: "b-green", Rejected: "b-red" } as const;
type Editing = Partial<DirEntry> & { kind: DirKind; resubmit?: boolean };

/** iaqc edits the live list and verifies submissions; ac proposes additions and edits (pending until verified); read = view only. */
export function DirectoryManager({ entries, submissions, districts, mode, myDistrict }: { entries: DirEntry[]; submissions: DirChange[]; districts: string[]; mode: "iaqc" | "ac" | "read"; myDistrict: string | null }) {
  const router = useRouter(), toast = useToast();
  const [kind, setKind] = useState<DirKind>("trainer"), [q, setQ] = useState(""), [district, setDistrict] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null), [rejecting, setRejecting] = useState<DirChange | null>(null);
  const canEdit = mode !== "read", s = q.toLowerCase();
  const rows = entries.filter(e => e.kind === kind && (!s || `${e.name} ${e.phone} ${e.email} ${e.notes}`.toLowerCase().includes(s)) && (!district || !e.district || e.district === district));
  const live = new Map(entries.map(e => [e.id, e]));
  const pending = submissions.filter(c => c.status === "Pending");
  const shown = mode === "iaqc" ? pending : submissions;

  async function remove(e: DirEntry) {
    if (!window.confirm(`Remove ${e.name} from ${DIRECTORY[kind].label}?`)) return;
    const r = await deleteDirEntry(e.id, e.kind);
    if (r.error) return toast(r.error, true);
    toast("Entry removed"); router.refresh();
  }
  async function verify(c: DirChange) {
    const r = await reviewDirChange(c.id, true, "");
    if (r.error) return toast(r.error, true);
    toast(`${c.name} verified and listed`); router.refresh();
  }

  return (
    <>
      <PageHead title="Directory" sub={mode === "ac" ? "Trainers and placement officers for your centres. Additions and edits you make are listed once the IAQA Coordinator verifies them."
        : mode === "iaqc" ? "Trainers and placement officers. Area Coordinators' additions and edits wait below for your verification."
        : "Trainers and placement officers to contact for your centres."}>
        {canEdit && <button className="btn primary" onClick={() => setEditing({ kind })}><Icon name="plus" />Add to {DIRECTORY[kind].label}</button>}
      </PageHead>

      {mode !== "read" && (mode === "ac" ? submissions.length > 0 : true) && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div className="hd"><h2>{mode === "iaqc" ? "Pending verification" : "My submissions"}</h2><span className="small faint">{mode === "iaqc" ? `${pending.length} waiting` : `${pending.length} pending`}</span></div>
          <div className="tw"><table>
            <thead><tr><th>List</th><th>Change</th><th>Name</th><th>Phone / email</th><th>ASO</th><th>{mode === "iaqc" ? "Submitted by" : "Submitted"}</th>{mode === "ac" && <th>Status</th>}<th /></tr></thead>
            <tbody>{shown.map(c => {
              const cur = c.entry_id ? live.get(c.entry_id) : null;
              return (
                <tr key={c.id}>
                  <td data-l="List">{DIRECTORY[c.kind].label}</td>
                  <td data-l="Change" className="small">{c.entry_id ? <>Edit{cur && cur.name !== c.name ? <> of <b>{cur.name}</b></> : null}</> : "New entry"}</td>
                  <td data-l="Name"><b>{c.name}</b>{c.notes && <div className="small muted">{c.notes}</div>}</td>
                  <td data-l="Phone / email" className="small">{[c.phone, c.email].filter(Boolean).join(" · ")}</td>
                  <td data-l="ASO">{c.district ?? <span className="faint">All</span>}</td>
                  <td data-l="Submitted" className="small">{mode === "iaqc" && <>{c.by}<br /></>}<span className="faint">{fmtDT(c.submitted_at)}</span></td>
                  {mode === "ac" && <td data-l="Status"><span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span>
                    {c.status !== "Pending" && <div className="small faint">{c.reviewer} · {fmtDT(c.reviewed_at)}</div>}
                    {c.remark && <div className="small late">{c.remark}</div>}</td>}
                  <td data-l="" className="nowrap right">
                    {mode === "iaqc" && <><button className="btn sm quiet" onClick={() => setRejecting(c)}>Reject</button>{" "}<button className="btn sm primary" onClick={() => verify(c)}>Verify</button></>}
                    {mode === "ac" && c.status === "Rejected" && <button className="btn sm" onClick={() => setEditing({ ...c, id: c.entry_id ?? undefined, resubmit: true })}>Correct and resubmit</button>}
                  </td>
                </tr>
              );
            })}
            {!shown.length && <tr><td data-l="" colSpan={8} className="empty">Nothing is waiting for verification.</td></tr>}</tbody>
          </table></div>
        </div>
      )}

      <div className="card">
        <div className="filters">
          <div className="seg" role="group" aria-label="List">
            {KINDS.map(k => <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)}>{DIRECTORY[k].label} {entries.filter(e => e.kind === k).length}</button>)}
          </div>
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, email or notes" aria-label="Search directory" /></div>
          {!myDistrict && districts.length > 1 && <select value={district} onChange={e => setDistrict(e.target.value)} aria-label="ASO"><option value="">All ASOs</option>{districts.map(d => <option key={d}>{d}</option>)}</select>}
          <span className="spacer" /><span className="small faint">{rows.length} shown</span>
        </div>
        <div className="tw"><table>
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>ASO</th><th>{DIRECTORY[kind].notes}</th>{canEdit && <th />}</tr></thead>
          <tbody>{rows.map(e => (
            <tr key={e.id}>
              <td data-l="Name"><b>{e.name}</b></td>
              <td data-l="Phone" className="nowrap">{e.phone ? <a href={`tel:${e.phone}`}>{e.phone}</a> : <span className="faint">—</span>}</td>
              <td data-l="Email">{e.email ? <a href={`mailto:${e.email}`}>{e.email}</a> : <span className="faint">—</span>}</td>
              <td data-l="ASO">{e.district ?? <span className="faint">All</span>}</td>
              <td data-l={DIRECTORY[kind].notes} className="small muted">{e.notes}</td>
              {canEdit && <td data-l="" className="nowrap right">
                {mode === "iaqc" && <><button className="btn sm quiet" onClick={() => remove(e)}>Remove</button>{" "}</>}
                <button className="btn sm" onClick={() => setEditing(e)}>Edit</button>
              </td>}
            </tr>
          ))}
          {!rows.length && <tr><td data-l="" colSpan={6} className="empty"><b>No entries</b>{canEdit ? "Add the first one with the button above." : "Nothing has been listed here yet."}</td></tr>}</tbody>
        </table></div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${editing?.resubmit ? "Correct and resubmit:" : editing?.id ? "Edit" : "Add to"} ${DIRECTORY[editing?.kind ?? kind].label}`}
        submitLabel={mode === "ac" ? "Send for verification" : editing?.id ? "Save changes" : "Add"}
        onSubmit={async f => {
          const v = formData(f);
          const r = await saveDirEntry(editing?.id ?? null, { kind: editing!.kind, name: v.name, phone: v.phone, email: v.email, district: v.district ?? "", notes: v.notes });
          if (r.error) return r.error;
          toast(mode === "ac" ? "Sent to the IAQA Coordinator for verification" : editing?.id ? "Entry updated" : "Entry added"); router.refresh();
        }}>
        {editing && <>
          {mode === "ac" && <p className="small muted">The IAQA Coordinator verifies this before it appears in the Directory.{editing.id ? " Until then the current details stay listed." : ""}</p>}
          <label className="f"><span>Name</span><input name="name" required defaultValue={editing.name} /></label>
          <div className="grid2">
            <label className="f"><span>Phone</span><input name="phone" type="tel" defaultValue={editing.phone} /></label>
            <label className="f"><span>Email</span><input name="email" type="email" defaultValue={editing.email} /></label>
          </div>
          {myDistrict ? <p className="small faint">ASO: {myDistrict}</p>
            : <label className="f"><span>ASO</span><select name="district" defaultValue={editing.district ?? (mode === "ac" ? districts[0] ?? "" : "")}>
              {(mode === "iaqc" || (editing.id && !editing.district)) && <option value="">All ASOs</option>}
              {editing.district && !districts.includes(editing.district) && <option>{editing.district}</option>}
              {districts.map(d => <option key={d}>{d}</option>)}</select></label>}
          <label className="f"><span>{DIRECTORY[editing.kind].notes} (optional)</span><textarea name="notes" defaultValue={editing.notes} /></label>
        </>}
      </Modal>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={`Reject: ${rejecting?.name ?? ""}`} submitLabel="Reject" onSubmit={async f => {
        const r = await reviewDirChange(rejecting!.id, false, formData(f).remark);
        if (r.error) return r.error;
        toast("Submission rejected"); router.refresh();
      }}>
        <p className="small muted">The Area Coordinator sees this remark and can correct and resubmit. The Directory stays as it is.</p>
        <label className="f"><span>Remark (required)</span><textarea name="remark" required /></label>
      </Modal>
    </>
  );
}
