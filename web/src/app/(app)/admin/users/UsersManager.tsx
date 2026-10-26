"use client";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useState } from "react";
import { createUser, resetPassword, updateUser } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { PageHead } from "@/components/ui";
import { initials } from "@/lib/format";

type User = { id: string; username: string; name: string; role: "ac" | "iaqc" | "cmd" | "dept"; area: string; district: string | null; department: string | null; active: boolean; centres: { id: number; code: string }[] };
type CentreLite = { id: number; code: string; name: string; district: string; ac_id: string | null; ac_name: string | null };
const ROLE = { ac: "Area Coordinator", iaqc: "IAQA Coordinator", cmd: "CMD, Super Admin", dept: "Department In-Charge" };
const tempPassword = () => "Temp@" + Math.random().toString(36).slice(2, 8) + Math.floor(Math.random() * 90 + 10);

/** ASO chips select whole areas; the grouped list fine-tunes single centres. The area text is derived from the selection. */
function AreaPicker({ centres, selected, owner }: { centres: CentreLite[]; selected: number[]; owner?: string }) {
  const [sel, setSel] = useState(() => new Set(selected)), [q, setQ] = useState("");
  const asos = [...new Set(centres.map(c => c.district))].sort();
  const byAso = (a: string) => centres.filter(c => c.district === a);
  const picked = (a: string) => byAso(a).filter(c => sel.has(c.id)).length;
  const area = asos.filter(a => picked(a) > 0);
  const set = (ids: number[], on: boolean) => setSel(s => { const n = new Set(s); ids.forEach(i => on ? n.add(i) : n.delete(i)); return n; });
  const toggleAso = (a: string) => { const ids = byAso(a).map(c => c.id); set(ids, picked(a) < ids.length); };
  const s = q.trim().toLowerCase();
  const shown = s ? asos.filter(a => byAso(a).some(c => `${c.code} ${c.name} ${a}`.toLowerCase().includes(s))) : area;

  return (
    <>
      <div className="f"><span className="lbl-row"><b>Area (ASOs)</b><span className="faint">Select an ASO to assign all its centres</span></span>
        <input type="hidden" name="area" value={area.join(", ")} />
        <div className="aso-chips" role="group" aria-label="ASOs">
          {asos.map(a => {
            const n = byAso(a).length, k = picked(a);
            return (
              <button key={a} type="button" className={k === n ? "on" : k ? "part" : ""} aria-pressed={k === n} onClick={() => toggleAso(a)}>
                {k === n ? <Icon name="tick" size={14} /> : null}{a}<span>{k && k < n ? `${k}/${n}` : n}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="f"><span className="lbl-row"><b>Assigned centres</b><span className="faint">{sel.size} selected</span>
        {sel.size > 0 && <button type="button" className="btn sm quiet" onClick={() => setSel(new Set())}>Clear all</button>}</span>
        <div className="picker">
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && e.preventDefault()} placeholder="Find a centre by name or code" aria-label="Find a centre" /></div>
          <div className="picker-list">
            {!shown.length && <p className="small faint" style={{ margin: 0, padding: "18px 14px" }}>{s ? "No centre matches that search." : "Select an ASO above, or search for a single centre."}</p>}
            {shown.map(a => {
              const cs = byAso(a).filter(c => !s || `${c.code} ${c.name} ${a}`.toLowerCase().includes(s)), n = byAso(a).length, k = picked(a);
              return (
                <div key={a} className="picker-group">
                  <label className="picker-head">
                    <input type="checkbox" checked={k === n} ref={el => { if (el) el.indeterminate = k > 0 && k < n; }} onChange={() => toggleAso(a)} />
                    <b>{a}</b><span className="faint">{k} of {n}</span>
                  </label>
                  {cs.map(c => (
                    <label key={c.id} className="picker-row">
                      <input type="checkbox" checked={sel.has(c.id)} onChange={e => set([c.id], e.target.checked)} />
                      <span className="code">{c.code}</span><span className="grow">{c.name}</span>
                      {c.ac_id && c.ac_id !== owner && <span className="small faint">now {c.ac_name}</span>}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        {[...sel].map(id => <input key={id} type="hidden" name="centre" value={id} />)}
      </div>
    </>
  );
}
function AsoSelect({ asos, value }: { asos: string[]; value?: string }) {
  return (
    <label className="f"><span>ASO district (sees only these centres, read-only)</span>
      <select name="district" required defaultValue={value ?? ""}><option value="" disabled>Choose a district</option>{asos.map(a => <option key={a}>{a}</option>)}</select></label>
  );
}
function DeptSelect({ departments, value }: { departments: string[]; value?: string }) {
  return (
    <label className="f"><span>Department (sees only requests assigned to it)</span>
      <select name="department" required defaultValue={value ?? ""}><option value="" disabled>Choose a department</option>
        {value && !departments.includes(value) && <option>{value}</option>}{departments.map(d => <option key={d}>{d}</option>)}</select></label>
  );
}
const pickedIds = (f: HTMLFormElement) => [...f.querySelectorAll<HTMLInputElement>("input[type=hidden][name=centre]")].map(i => Number(i.value));

export function UsersManager({ users, centres, departments }: { users: User[]; centres: CentreLite[]; departments: string[] }) {
  const router = useRouter(), toast = useToast();
  const [creatingAso, setCreatingAso] = useState(false), [editingAso, setEditingAso] = useState<User | null>(null);
  const [creatingDept, setCreatingDept] = useState(false), [editingDept, setEditingDept] = useState<User | null>(null);
  const asos = [...new Set(centres.map(c => c.district))].sort();
  const [creating, setCreating] = useState(false), [editing, setEditing] = useState<User | null>(null), [resetting, setResetting] = useState<User | null>(null);
  const done = (msg: string) => { toast(msg); router.refresh(); };

  async function toggle(u: User) {
    const r = await updateUser(u.id, { name: u.name, area: u.area, active: !u.active });
    if (r.error) return toast(r.error, true);
    done(u.active ? "User deactivated" : "User activated");
  }

  return (
    <>
      <PageHead title="Users" sub="Area Coordinators see only the centres assigned to them. ASO Directors get read-only access to one district. Department in-charges see only support requests assigned to their department. IAQA and CMD are fixed system accounts.">
        <button className="btn" onClick={() => setCreatingDept(true)}><Icon name="plus" />New Department In-Charge</button>
        <button className="btn" onClick={() => setCreatingAso(true)}><Icon name="plus" />New ASO Director</button>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" />New Area Coordinator</button>
      </PageHead>
      <div className="card"><div className="tw"><table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Area</th><th>Assigned centres</th><th>Status</th><th /></tr></thead>
        <tbody>{users.map((u, i) => (
          <motion.tr key={u.id} className={u.active ? "" : "inactive"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: u.active ? 1 : 0.55, y: 0 }} transition={{ delay: i * 0.03 }}>
            <td data-l="Name"><div className="row" style={{ gap: 10, flexWrap: "nowrap" }}><span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(u.name)}</span><b>{u.name}</b></div></td>
            <td data-l="Username" className="muted">{u.username}</td><td data-l="Role">{u.district ? "ASO Director" : u.role === "dept" ? `In-Charge, ${u.department}` : ROLE[u.role]}</td><td data-l="Area" className="small">{u.area}</td>
            <td data-l="Assigned centres" className="small">{u.role === "ac" ? (u.centres.map(c => c.code).join(", ") || <span className="faint">None</span>) : <span className="faint">{u.district ? `All in ${u.district}` : u.role === "dept" ? "None (support requests only)" : "All (role-based)"}</span>}</td>
            <td data-l="Status">{u.active ? <span className="badge b-green">Active</span> : <span className="badge b-grey">Inactive</span>}</td>
            <td data-l="" className="nowrap right">{u.role === "ac" || u.role === "dept" || u.district ? <>
              <button className="btn sm quiet" onClick={() => toggle(u)}>{u.active ? "Deactivate" : "Activate"}</button>{" "}
              <button className="btn sm" onClick={() => setResetting(u)}>Reset password</button>{" "}
              <button className="btn sm" onClick={() => u.district ? setEditingAso(u) : u.role === "dept" ? setEditingDept(u) : setEditing(u)}>Edit</button>
            </> : <span className="small faint">System account</span>}</td>
          </motion.tr>
        ))}</tbody>
      </table></div></div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New Area Coordinator" submitLabel="Create account" wide onSubmit={async f => {
        const v = formData(f);
        const r = await createUser({ username: v.username, name: v.name, area: v.area, password: v.password, centre_ids: pickedIds(f) });
        if (r.error) return r.error;
        done("Area Coordinator created");
      }}>
        <div className="grid2">
          <label className="f"><span>Full name</span><input name="name" required /></label>
          <label className="f"><span>Username</span><input name="username" required pattern="[A-Za-z0-9._]+" placeholder="e.g. meera.ac" autoCapitalize="none" /></label>
        </div>
        <label className="f"><span>Temporary password (share it securely)</span><input name="password" required minLength={8} defaultValue={creating ? tempPassword() : ""} /></label>
        <AreaPicker centres={centres} selected={[]} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Area Coordinator" wide onSubmit={async f => {
        const v = formData(f);
        const r = await updateUser(editing!.id, { name: v.name, area: v.area, active: v.active === "on", centre_ids: pickedIds(f) });
        if (r.error) return r.error;
        done("User updated");
      }}>
        {editing && <>
          <label className="f"><span>Full name</span><input name="name" required defaultValue={editing.name} /></label>
          <AreaPicker centres={centres} selected={editing.centres.map(c => c.id)} owner={editing.id} />
          <label className="check"><input type="checkbox" name="active" defaultChecked={editing.active} /> Active account</label>
        </>}
      </Modal>

      <Modal open={creatingAso} onClose={() => setCreatingAso(false)} title="New ASO Director" submitLabel="Create account" onSubmit={async f => {
        const v = formData(f);
        const r = await createUser({ username: v.username, name: v.name, area: "", password: v.password, centre_ids: [], district: v.district });
        if (r.error) return r.error;
        done("ASO Director created");
      }}>
        <div className="grid2">
          <label className="f"><span>Full name</span><input name="name" required /></label>
          <label className="f"><span>Username</span><input name="username" required pattern="[A-Za-z0-9._]+" placeholder="e.g. aso.mlp" autoCapitalize="none" /></label>
        </div>
        <AsoSelect asos={asos} />
        <label className="f"><span>Temporary password (share it securely)</span><input name="password" required minLength={8} defaultValue={creatingAso ? tempPassword() : ""} /></label>
      </Modal>

      <Modal open={!!editingAso} onClose={() => setEditingAso(null)} title="Edit ASO Director" onSubmit={async f => {
        const v = formData(f);
        const r = await updateUser(editingAso!.id, { name: v.name, area: "", active: v.active === "on", district: v.district });
        if (r.error) return r.error;
        done("User updated");
      }}>
        {editingAso && <>
          <label className="f"><span>Full name</span><input name="name" required defaultValue={editingAso.name} /></label>
          <AsoSelect asos={asos} value={editingAso.district ?? undefined} />
          <label className="check"><input type="checkbox" name="active" defaultChecked={editingAso.active} /> Active account</label>
        </>}
      </Modal>

      <Modal open={creatingDept} onClose={() => setCreatingDept(false)} title="New Department In-Charge" submitLabel="Create account" onSubmit={async f => {
        const v = formData(f);
        const r = await createUser({ username: v.username, name: v.name, area: "", password: v.password, centre_ids: [], department: v.department });
        if (r.error) return r.error;
        done("Department in-charge created");
      }}>
        <div className="grid2">
          <label className="f"><span>Full name</span><input name="name" required /></label>
          <label className="f"><span>Username</span><input name="username" required pattern="[A-Za-z0-9._]+" placeholder="e.g. academics.head" autoCapitalize="none" /></label>
        </div>
        <DeptSelect departments={departments} />
        <label className="f"><span>Temporary password (share it securely)</span><input name="password" required minLength={8} defaultValue={creatingDept ? tempPassword() : ""} /></label>
      </Modal>

      <Modal open={!!editingDept} onClose={() => setEditingDept(null)} title="Edit Department In-Charge" onSubmit={async f => {
        const v = formData(f);
        const r = await updateUser(editingDept!.id, { name: v.name, area: "", active: v.active === "on", department: v.department });
        if (r.error) return r.error;
        done("User updated");
      }}>
        {editingDept && <>
          <label className="f"><span>Full name</span><input name="name" required defaultValue={editingDept.name} /></label>
          <DeptSelect departments={departments} value={editingDept.department ?? undefined} />
          <label className="check"><input type="checkbox" name="active" defaultChecked={editingDept.active} /> Active account</label>
        </>}
      </Modal>

      <Modal open={!!resetting} onClose={() => setResetting(null)} title={`Reset password: ${resetting?.name ?? ""}`} submitLabel="Reset password" onSubmit={async f => {
        const r = await resetPassword(resetting!.id, formData(f).password);
        if (r.error) return r.error;
        toast("Password reset");
      }}>
        <label className="f"><span>New temporary password</span><input name="password" required minLength={8} defaultValue={resetting ? tempPassword() : ""} /></label>
        <p className="small muted">Share the new password with the user through a secure channel.</p>
      </Modal>
    </>
  );
}
