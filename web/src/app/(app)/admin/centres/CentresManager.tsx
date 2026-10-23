"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Centre } from "@/lib/data";
import { saveCentre } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { PageHead } from "@/components/ui";
import { fmtDate } from "@/lib/format";

type Ac = { id: string; name: string; username: string; active: boolean };

export function CentresManager({ centres, acs }: { centres: Centre[]; acs: Ac[] }) {
  const router = useRouter(), toast = useToast();
  const [q, setQ] = useState(""), [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Partial<Centre> | null>(null);
  const s = q.toLowerCase();
  const rows = centres.filter(c => (!s || `${c.name} ${c.code} ${c.location} ${c.district}`.toLowerCase().includes(s)) && (status === "" || String(c.active) === status));
  const districts = [...new Set(centres.map(c => c.district))];

  async function toggle(c: Centre) {
    const r = await saveCentre(c.id, { code: c.code, name: c.name, location: c.location, district: c.district, ac_id: c.ac_id, active: !c.active });
    if (r.error) return toast(r.error, true);
    toast(c.active ? "Centre deactivated" : "Centre activated"); router.refresh();
  }

  return (
    <>
      <PageHead title="Centres" sub={`${centres.filter(c => c.active).length} active of ${centres.length} centres`}>
        <button className="btn primary" onClick={() => setEditing({ active: true })}><Icon name="plus" />Add centre</button>
      </PageHead>
      <div className="card">
        <div className="filters">
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, location or ASO" aria-label="Search centres" /></div>
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select>
          <span className="spacer" /><span className="small faint">{rows.length} shown</span>
        </div>
        <div className="tw"><table>
          <thead><tr><th>Code</th><th>Centre</th><th>Location</th><th>ASO</th><th>Area Coordinator</th><th>Last visit</th><th>Status</th><th /></tr></thead>
          <tbody><AnimatePresence initial={false}>{rows.map(c => (
            <motion.tr key={c.id} layout="position" className={c.active ? "" : "inactive"} initial={{ opacity: 0 }} animate={{ opacity: c.active ? 1 : 0.55 }} exit={{ opacity: 0 }}>
              <td data-l="Code" className="code">{c.code}</td><td data-l="Centre"><b>{c.name}</b>{c.demo && <> <span className="chip">Demo</span></>}</td>
              <td data-l="Location">{c.location}</td><td data-l="ASO">{c.district}</td><td data-l="Area Coordinator">{c.ac_name ?? <span className="faint">Unassigned</span>}</td>
              <td data-l="Last visit" className="nowrap">{fmtDate(c.last_visit)}</td>
              <td data-l="Status">{c.active ? <span className="badge b-green">Active</span> : <span className="badge b-grey">Inactive</span>}</td>
              <td data-l="" className="nowrap right">
                <button className="btn sm quiet" onClick={() => toggle(c)}>{c.active ? "Deactivate" : "Activate"}</button>{" "}
                <button className="btn sm" onClick={() => setEditing(c)}>Edit</button>{" "}
                <Link className="btn sm" href={`/scorecard/${c.id}`}>Scorecard</Link>
              </td>
            </motion.tr>
          ))}</AnimatePresence>
          {!rows.length && <tr><td data-l="" colSpan={8} className="empty"><b>No matching centres</b>Adjust the search or status filter.</td></tr>}</tbody>
        </table></div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit centre" : "Add centre"} submitLabel={editing?.id ? "Save changes" : "Create centre"}
        onSubmit={async f => {
          const v = formData(f);
          const r = await saveCentre(editing?.id ?? null, { code: v.code, name: v.name, location: v.location, district: v.district, ac_id: v.ac_id || null, active: v.active === "on" });
          if (r.error) return r.error;
          toast(editing?.id ? "Centre updated" : "Centre created"); router.refresh();
        }}>
        {editing && <>
          <div className="grid2">
            <label className="f"><span>Centre code</span><input name="code" required defaultValue={editing.code} placeholder="e.g. TVM-03" /></label>
            <label className="f"><span>Centre name</span><input name="name" required defaultValue={editing.name} /></label>
            <label className="f"><span>Location</span><input name="location" required defaultValue={editing.location} /></label>
            <label className="f"><span>ASO</span><input name="district" required defaultValue={editing.district} list="dlist" />
              <datalist id="dlist">{districts.map(d => <option key={d} value={d} />)}</datalist></label>
          </div>
          <label className="f"><span>Assigned Area Coordinator</span><select name="ac_id" defaultValue={editing.ac_id ?? ""}>
            <option value="">Unassigned</option>
            {acs.map(u => <option key={u.id} value={u.id} disabled={!u.active}>{u.name} ({u.username}){u.active ? "" : " (inactive)"}</option>)}
          </select></label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={editing.active !== false} /> Active centre</label>
        </>}
      </Modal>
    </>
  );
}
