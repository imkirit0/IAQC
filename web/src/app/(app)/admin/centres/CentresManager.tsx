"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Centre } from "@/lib/data";
import { createUser, deleteCentre, saveCentre } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { PageHead } from "@/components/ui";
import { fmtDate } from "@/lib/format";

const num = (v: string) => (v.trim() === "" ? null : Number(v));
type Ac = { id: string; name: string; username: string; active: boolean };
const tempPassword = () => "Temp@" + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 90 + 10);

export function CentresManager({ centres, acs, asos }: { centres: Centre[]; acs: Ac[]; asos: { name: string; district: string }[] }) {
  const router = useRouter(), toast = useToast();
  const [q, setQ] = useState(""), [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Partial<Centre> | null>(null), [addingAso, setAddingAso] = useState(false), [deleting, setDeleting] = useState<Centre | null>(null);
  const directors = (d: string) => asos.filter(a => a.district.toLowerCase() === d.toLowerCase()).map(a => a.name).join(", ");
  const s = q.toLowerCase();
  const rows = centres.filter(c => (!s || `${c.name} ${c.code} ${c.location} ${c.district}`.toLowerCase().includes(s)) && (status === "" || String(c.active) === status));
  const districts = [...new Set(centres.map(c => c.district))];

  async function toggle(c: Centre) {
    const r = await saveCentre(c.id, { code: c.code, name: c.name, location: c.location, district: c.district, ac_id: c.ac_id, active: !c.active, lat: c.lat, lng: c.lng });
    if (r.error) return toast(r.error, true);
    toast(c.active ? "Centre archived" : "Centre restored"); router.refresh();
    return true;
  }

  return (
    <>
      <PageHead title="Centres" sub={`${centres.filter(c => c.active).length} active of ${centres.length} centres`}>
        <button className="btn" onClick={() => setAddingAso(true)}><Icon name="plus" />Add ASO</button>
        <button className="btn primary" onClick={() => setEditing({ active: true })}><Icon name="plus" />Add centre</button>
      </PageHead>
      <div className="card">
        <div className="filters">
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, location or ASO" aria-label="Search centres" /></div>
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="true">Active</option><option value="false">Archived</option></select>
          <span className="spacer" /><span className="small faint">{rows.length} shown</span>
        </div>
        <div className="tw"><table>
          <thead><tr><th>Code</th><th>Centre</th><th>Location</th><th>ASO</th><th>Area Coordinator</th><th>Last visit</th><th>Status</th><th /></tr></thead>
          <tbody><AnimatePresence initial={false}>{rows.map(c => (
            <motion.tr key={c.id} layout="position" className={c.active ? "" : "inactive"} initial={{ opacity: 0 }} animate={{ opacity: c.active ? 1 : 0.55 }} exit={{ opacity: 0 }}>
              <td data-l="Code" className="code">{c.code}</td><td data-l="Centre"><b>{c.name}</b>{c.demo && <> <span className="chip">Demo</span></>}</td>
              <td data-l="Location">{c.location}</td><td data-l="ASO">{c.district}{directors(c.district) && <div className="small faint">{directors(c.district)}</div>}</td><td data-l="Area Coordinator">{c.ac_name ?? <span className="faint">Unassigned</span>}</td>
              <td data-l="Last visit" className="nowrap">{fmtDate(c.last_visit)}</td>
              <td data-l="Status">{c.active ? <span className="badge b-green">Active</span> : <span className="badge b-grey">Archived</span>}</td>
              <td data-l="" className="nowrap right">
                {c.active ? <button className="btn sm quiet" onClick={() => setDeleting(c)}>Delete</button> : <button className="btn sm quiet" onClick={() => toggle(c)}>Restore</button>}{" "}
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
          const r = await saveCentre(editing?.id ?? null, { code: v.code, name: v.name, location: v.location, district: v.district, ac_id: v.ac_id || null, active: v.active === "on", lat: num(v.lat), lng: num(v.lng) });
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
          <div className="grid2">
            <label className="f"><span>Latitude (optional)</span><input name="lat" type="number" step="any" min="-90" max="90" defaultValue={editing.lat ?? ""} placeholder="e.g. 11.0510" /></label>
            <label className="f"><span>Longitude (optional)</span><input name="lng" type="number" step="any" min="-180" max="180" defaultValue={editing.lng ?? ""} placeholder="e.g. 76.0711" /></label>
          </div>
          <p className="small faint" style={{ marginTop: -6 }}>Registered centre location. Visit reports show how far from it the coordinator submitted.</p>
          <label className="f"><span>Assigned Area Coordinator</span><select name="ac_id" defaultValue={editing.ac_id ?? ""}>
            <option value="">Unassigned</option>
            {acs.map(u => <option key={u.id} value={u.id} disabled={!u.active}>{u.name} ({u.username}){u.active ? "" : " (inactive)"}</option>)}
          </select></label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={editing.active !== false} /> Active centre</label>
        </>}
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title={`Delete ${deleting?.name ?? ""}?`} submitLabel="Archive centre" onSubmit={async () => {
        if (!await toggle(deleting!)) return "The centre could not be archived.";
      }}>
        {deleting && <>
          <p><b>{deleting.code}</b> · {deleting.name}, {deleting.location}</p>
          <p className="small muted">Archiving removes the centre from active lists, visit assignments and new support requests. Its past visit reports and history stay viewable, and you can restore it later. The ASO Director{directors(deleting.district) ? ` (${directors(deleting.district)})` : ""} keeps access to the other centres in {deleting.district}.</p>
          <p className="small muted">Permanent deletion is possible only for a centre with no visit reports or support requests.</p>
          <button type="button" className="btn sm quiet" onClick={async () => {
            if (!window.confirm(`Permanently delete ${deleting.name}? This cannot be undone.`)) return;
            const r = await deleteCentre(deleting.id);
            if (r.error) return toast(r.error, true);
            setDeleting(null); toast("Centre deleted"); router.refresh();
          }}>Delete permanently instead</button>
        </>}
      </Modal>

      <Modal open={addingAso} onClose={() => setAddingAso(false)} title="Add ASO" submitLabel="Create account" onSubmit={async f => {
        const v = formData(f);
        const r = await createUser({ username: v.username, name: v.name, area: "", password: v.password, centre_ids: [], district: v.district, phone: v.phone, email: v.email });
        if (r.error) return r.error;
        toast("ASO created"); router.refresh();
      }}>
        <p className="small muted">An ASO Director signs in with read-only access to every centre in their ASO district.</p>
        <div className="grid2">
          <label className="f"><span>Full name</span><input name="name" required /></label>
          <label className="f"><span>Username</span><input name="username" required pattern="[A-Za-z0-9._]+" placeholder="e.g. aso.mlp" autoCapitalize="none" /></label>
          <label className="f"><span>Mobile number</span><input name="phone" type="tel" required placeholder="e.g. 9847000000" /></label>
          <label className="f"><span>Email</span><input name="email" type="email" required /></label>
        </div>
        <label className="f"><span>ASO district (centres assigned)</span><select name="district" required defaultValue=""><option value="" disabled>Choose a district</option>
          {[...new Set(centres.filter(c => c.active).map(c => c.district))].sort().map(d => <option key={d}>{d}</option>)}</select></label>
        <label className="f"><span>Temporary password (share it securely)</span><input name="password" required minLength={8} defaultValue={addingAso ? tempPassword() : ""} /></label>
      </Modal>
    </>
  );
}
