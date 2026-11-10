"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { CentreLite, Infra } from "@/lib/data";
import type { Spec } from "@/lib/support";
import { deleteInfra, saveInfra } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";

type Editing = { id?: number; centre_id?: number; name?: string; specs: Spec[] };

/** Infrastructure per centre: each entry has a name and any number of specifications the user names themselves. */
export function Infrastructure({ items, centres, canEdit, tabs }: { items: Infra[]; centres: CentreLite[]; canEdit: boolean; tabs: ReactNode }) {
  const router = useRouter(), toast = useToast();
  const [q, setQ] = useState(""), [centre, setCentre] = useState(""), [editing, setEditing] = useState<Editing | null>(null);
  const byId = new Map(centres.map(c => [c.id, c])), s = q.trim().toLowerCase();
  const rows = items.filter(i => (!centre || i.centre_id === Number(centre))
    && (!s || `${i.name} ${byId.get(i.centre_id)?.code} ${byId.get(i.centre_id)?.name} ${i.specs.map(x => `${x.label} ${x.value}`).join(" ")}`.toLowerCase().includes(s)));
  const setSpec = (n: number, patch: Partial<Spec>) => setEditing(e => e && { ...e, specs: e.specs.map((x, i) => (i === n ? { ...x, ...patch } : x)) });

  async function remove(i: Infra) {
    if (!window.confirm(`Delete "${i.name}" and its specifications from ${byId.get(i.centre_id)?.name ?? "this centre"}?`)) return;
    const r = await deleteInfra(i.id);
    if (r.error) return toast(r.error, true);
    toast("Infrastructure entry deleted"); router.refresh();
  }

  return (
    <div className="card">
      <div className="filters">
        {tabs}
        <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, centre or specification" aria-label="Search infrastructure" /></div>
        {centres.length > 1 && <select value={centre} onChange={e => setCentre(e.target.value)} aria-label="Centre"><option value="">All centres</option>{centres.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select>}
        <span className="spacer" /><span className="small faint">{rows.length} shown</span>
        {canEdit && centres.length > 0 && <button className="btn sm primary" onClick={() => setEditing({ centre_id: centre ? Number(centre) : undefined, specs: [{ label: "", value: "" }] })}><Icon name="plus" />Add infrastructure</button>}
      </div>
      <div className="tw"><table>
        <thead><tr><th>Centre</th><th>Infrastructure</th><th>Specifications</th>{canEdit && <th />}</tr></thead>
        <tbody>{rows.map(i => (
          <tr key={i.id}>
            <td data-l="Centre"><span className="code">{byId.get(i.centre_id)?.code}</span> {byId.get(i.centre_id)?.name}</td>
            <td data-l="Infrastructure"><b>{i.name}</b></td>
            <td data-l="Specifications" className="small">{i.specs.map((x, n) => <div key={n}><span className="muted">{x.label}:</span> {x.value || <span className="faint">—</span>}</div>)}{!i.specs.length && <span className="faint">None added</span>}</td>
            {canEdit && <td data-l="" className="nowrap right">
              <button className="btn sm quiet" onClick={() => remove(i)}>Delete</button>{" "}
              <button className="btn sm" onClick={() => setEditing({ id: i.id, centre_id: i.centre_id, name: i.name, specs: i.specs })}>Edit</button>
            </td>}
          </tr>
        ))}
        {!rows.length && <tr><td data-l="" colSpan={4} className="empty"><b>No infrastructure listed</b>{canEdit ? centres.length ? "Add the first entry with the button above." : "No centres are assigned to you yet." : "Nothing has been listed here yet."}</td></tr>}</tbody>
      </table></div>

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing?.id ? "Edit infrastructure" : "Add infrastructure"} submitLabel={editing?.id ? "Save changes" : "Add"}
        onSubmit={async f => {
          const v = formData(f);
          if (!editing!.id && !v.centre_id) return "Choose a centre.";
          const r = await saveInfra(editing!.id ?? null, { centre_id: Number(v.centre_id ?? editing!.centre_id), name: v.name, specs: editing!.specs });
          if (r.error) return r.error;
          toast(editing!.id ? "Infrastructure updated" : "Infrastructure added"); router.refresh();
        }}>
        {editing && <>
          {editing.id ? <p className="small faint">Centre: {byId.get(editing.centre_id!)?.code} {byId.get(editing.centre_id!)?.name}</p>
            : <label className="f"><span>Centre</span><select name="centre_id" required defaultValue={editing.centre_id ?? (centres.length === 1 ? centres[0].id : "")}>
              <option value="" disabled>Choose a centre</option>{centres.map(c => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></label>}
          <label className="f"><span>Name</span><input name="name" required maxLength={120} defaultValue={editing.name} placeholder="What this entry is" /></label>
          <div className="f"><span>Specifications</span>
            {editing.specs.map((x, n) => (
              <div key={n} className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "nowrap" }}>
                <input style={{ flex: "1 1 40%" }} value={x.label} maxLength={80} onChange={e => setSpec(n, { label: e.target.value })} placeholder="Specification" aria-label={`Specification ${n + 1} name`} />
                <input style={{ flex: "1 1 60%" }} value={x.value} maxLength={500} onChange={e => setSpec(n, { value: e.target.value })} placeholder="Value" aria-label={`Specification ${n + 1} value`} />
                <button type="button" className="btn sm quiet" aria-label={`Remove specification ${n + 1}`} onClick={() => setEditing({ ...editing, specs: editing.specs.filter((_, i) => i !== n) })}><Icon name="close" /></button>
              </div>
            ))}
            <button type="button" className="btn sm" onClick={() => setEditing({ ...editing, specs: [...editing.specs, { label: "", value: "" }] })}><Icon name="plus" />Add specification</button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
