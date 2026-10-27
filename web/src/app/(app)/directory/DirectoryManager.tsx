"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DirEntry } from "@/lib/data";
import { DIRECTORY, type DirKind } from "@/lib/support";
import { deleteDirEntry, saveDirEntry } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { PageHead } from "@/components/ui";

const KINDS = Object.keys(DIRECTORY) as DirKind[];

export function DirectoryManager({ entries, districts, editable, myDistrict }: { entries: DirEntry[]; districts: string[]; editable: DirKind[]; myDistrict: string | null }) {
  const router = useRouter(), toast = useToast();
  const [kind, setKind] = useState<DirKind>(editable[0] ?? "pro"), [q, setQ] = useState(""), [district, setDistrict] = useState("");
  const [editing, setEditing] = useState<Partial<DirEntry> | null>(null);
  const canEdit = editable.includes(kind), s = q.toLowerCase();
  const rows = entries.filter(e => e.kind === kind && (!s || `${e.name} ${e.phone} ${e.email} ${e.notes}`.toLowerCase().includes(s)) && (!district || !e.district || e.district === district));

  async function remove(e: DirEntry) {
    if (!window.confirm(`Remove ${e.name} from ${DIRECTORY[kind].label}?`)) return;
    const r = await deleteDirEntry(e.id, e.kind);
    if (r.error) return toast(r.error, true);
    toast("Entry removed"); router.refresh();
  }

  return (
    <>
      <PageHead title="Directory" sub="PROs, trainers and placement officers to contact for your centres.">
        {canEdit && <button className="btn primary" onClick={() => setEditing({ kind })}><Icon name="plus" />Add to {DIRECTORY[kind].label}</button>}
      </PageHead>
      <div className="card">
        <div className="filters">
          <div className="seg" role="group" aria-label="List">
            {KINDS.map(k => <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)}>{DIRECTORY[k].label} {entries.filter(e => e.kind === k).length}</button>)}
          </div>
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, email or notes" aria-label="Search directory" /></div>
          {!myDistrict && <select value={district} onChange={e => setDistrict(e.target.value)} aria-label="ASO"><option value="">All ASOs</option>{districts.map(d => <option key={d}>{d}</option>)}</select>}
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
                {(!myDistrict || e.district === myDistrict) && <><button className="btn sm quiet" onClick={() => remove(e)}>Remove</button>{" "}<button className="btn sm" onClick={() => setEditing(e)}>Edit</button></>}
              </td>}
            </tr>
          ))}
          {!rows.length && <tr><td data-l="" colSpan={6} className="empty"><b>No entries</b>{canEdit ? "Add the first one with the button above." : "Nothing has been listed here yet."}</td></tr>}</tbody>
        </table></div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`${editing?.id ? "Edit" : "Add to"} ${DIRECTORY[editing?.kind ?? kind].label}`} submitLabel={editing?.id ? "Save changes" : "Add"}
        onSubmit={async f => {
          const v = formData(f);
          const r = await saveDirEntry(editing?.id ?? null, { kind: editing!.kind!, name: v.name, phone: v.phone, email: v.email, district: v.district ?? "", notes: v.notes });
          if (r.error) return r.error;
          toast(editing?.id ? "Entry updated" : "Entry added"); router.refresh();
        }}>
        {editing && <>
          <label className="f"><span>Name</span><input name="name" required defaultValue={editing.name} /></label>
          <div className="grid2">
            <label className="f"><span>Phone</span><input name="phone" type="tel" defaultValue={editing.phone} /></label>
            <label className="f"><span>Email</span><input name="email" type="email" defaultValue={editing.email} /></label>
          </div>
          {myDistrict ? <p className="small faint">ASO: {myDistrict}</p>
            : <label className="f"><span>ASO</span><select name="district" defaultValue={editing.district ?? ""}><option value="">All ASOs</option>{districts.map(d => <option key={d}>{d}</option>)}</select></label>}
          <label className="f"><span>{DIRECTORY[editing.kind!].notes} (optional)</span><textarea name="notes" defaultValue={editing.notes} /></label>
        </>}
      </Modal>
    </>
  );
}
