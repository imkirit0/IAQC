"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Criterion, Section } from "@/lib/data";
import { PRIORITIES, type Priority } from "@/lib/scoring";
import { saveCriterion, saveSection } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { Ledger, PageHead, Reveal } from "@/components/ui";

export function ChecklistManager({ sections, version, weights }: { sections: Section[]; version: number; weights: Record<Priority, number> }) {
  const router = useRouter(), toast = useToast();
  const [sec, setSec] = useState<Partial<Section> | null>(null), [crit, setCrit] = useState<Partial<Criterion> | null>(null);
  const [weight, setWeight] = useState(0);
  const live = sections.filter(s => s.active);
  const maxOf = (s: Section) => s.criteria.filter(c => c.active).reduce((a, c) => a + c.weight, 0);
  const total = live.reduce((a, s) => a + maxOf(s), 0);
  const done = (msg: string) => { toast(msg); router.refresh(); };
  const openCrit = (c: Partial<Criterion>) => { setCrit(c); setWeight(c.weight ?? weights[c.priority ?? "Medium"]); };
  const critInput = (c: Criterion, active: boolean) => ({ section_id: c.section_id, text: c.text, description: c.description, priority: c.priority, weight: c.weight, critical: c.critical, mandatory: c.mandatory, active, sort: c.sort });

  return (
    <>
      <PageHead title="Checklist" sub={`Version ${version} · ${total} maximum points`}>
        <div className="row">
          <button className="btn" onClick={() => setSec({ active: true, sort: sections.length + 1 })}><Icon name="plus" />Section</button>
          <button className="btn primary" onClick={() => openCrit({ section_id: sections[0]?.id, priority: "Medium", active: true, sort: 99 })}><Icon name="plus" />Criterion</button>
        </div>
      </PageHead>
      <div className="banner info small"><Icon name="info" /><div>Changes apply to <b>future assessments only</b>; submitted reports keep the checklist and scoring rules they were submitted with.
        Criteria shown are <b>sample, configurable organisational policy requirements</b>, not verified existing organisational rules.</div></div>
      <Ledger cells={[
        { label: "Active sections", value: live.length }, { label: "Active criteria", value: live.reduce((a, s) => a + s.criteria.filter(c => c.active).length, 0) },
        { label: "Critical criteria", value: live.reduce((a, s) => a + s.criteria.filter(c => c.active && c.critical).length, 0), tone: "c" },
        { label: "Maximum score", value: total, note: "points" },
      ]} />
      {sections.map((s, i) => (
        <Reveal key={s.id} delay={Math.min(i, 6) * 0.05} className="card" style={{ marginTop: i ? 22 : 0, opacity: s.active ? 1 : 0.6 }}>
          <div className="hd"><h2>{s.name}</h2>{!s.active && <span className="chip">Inactive section</span>}
            <span className="small faint">{maxOf(s)} points · {s.criteria.filter(c => c.active).length} active criteria</span><span className="spacer" />
            <button className="btn sm quiet" onClick={() => setSec(s)}>Edit section</button>
            <button className="btn sm" onClick={() => openCrit({ section_id: s.id, priority: "Medium", active: true, sort: 99 })}><Icon name="plus" />Criterion</button></div>
          <div className="tw"><table>
            <thead><tr><th>#</th><th>Criterion</th><th>Priority</th><th className="right">Weight</th><th>Flags</th><th>Status</th><th /></tr></thead>
            <tbody>{s.criteria.length ? s.criteria.map(c => (
              <tr key={c.id} className={c.active ? "" : "inactive"}>
                <td className="mono small">{c.sort}</td>
                <td>{c.text}{c.description && <div className="small muted">{c.description}</div>}</td>
                <td><span className={`chip ${c.priority}`}>{c.priority}</span></td><td className="right mono">{c.weight}</td>
                <td>{c.critical && <span className="chip crit">Critical alert</span>} {c.mandatory && <span className="chip mand">Mandatory</span>}</td>
                <td>{c.active ? "Active" : <span className="faint">Inactive</span>}</td>
                <td className="nowrap right">
                  <button className="btn sm quiet" onClick={async () => { const r = await saveCriterion(c.id, critInput(c, !c.active)); if (r.error) toast(r.error, true); else done(c.active ? "Criterion deactivated" : "Criterion activated"); }}>{c.active ? "Deactivate" : "Activate"}</button>{" "}
                  <button className="btn sm" onClick={() => openCrit(c)}>Edit</button>
                </td>
              </tr>
            )) : <tr><td colSpan={7} className="empty">No criteria in this section yet.</td></tr>}</tbody>
          </table></div>
        </Reveal>
      ))}

      <Modal open={!!sec} onClose={() => setSec(null)} title={sec?.id ? "Edit section" : "Add section"} onSubmit={async f => {
        const v = formData(f);
        const r = await saveSection(sec?.id ?? null, { name: v.name, sort: Number(v.sort), active: v.active === "on" });
        if (r.error) return r.error;
        done(sec?.id ? "Section updated" : "Section added");
      }}>
        {sec && <>
          <label className="f"><span>Section name</span><input name="name" required defaultValue={sec.name} /></label>
          <label className="f"><span>Display order</span><input type="number" name="sort" defaultValue={sec.sort} /></label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={sec.active !== false} /> Active section</label>
        </>}
      </Modal>

      <Modal open={!!crit} onClose={() => setCrit(null)} title={crit?.id ? "Edit criterion" : "Add criterion"} wide onSubmit={async f => {
        const v = formData(f);
        const r = await saveCriterion(crit?.id ?? null, { section_id: Number(v.section_id), text: v.text, description: v.description, priority: v.priority as Priority, weight: Number(v.weight),
          critical: v.critical === "on", mandatory: v.mandatory === "on", active: v.active === "on", sort: Number(v.sort) });
        if (r.error) return r.error;
        done(crit?.id ? "Criterion updated" : "Criterion added");
      }}>
        {crit && <>
          <label className="f"><span>Section</span><select name="section_id" defaultValue={crit.section_id}>{sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label className="f"><span>Criterion</span><input name="text" required defaultValue={crit.text} /></label>
          <label className="f"><span>Guidance for Area Coordinators (optional)</span><textarea name="description" defaultValue={crit.description} /></label>
          <div className="grid2">
            <label className="f"><span>Priority</span><select name="priority" defaultValue={crit.priority} onChange={e => setWeight(weights[e.target.value as Priority])}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></label>
            <label className="f"><span>Weight (points)</span><input type="number" step="0.5" min="0.5" max="100" name="weight" required value={weight} onChange={e => setWeight(Number(e.target.value))} /></label>
          </div>
          <label className="f"><span>Display order</span><input type="number" name="sort" defaultValue={crit.sort} /></label>
          <label className="check"><input type="checkbox" name="critical" defaultChecked={crit.critical} /> Critical: a Non-Compliant response raises a critical-risk alert</label>
          <label className="check"><input type="checkbox" name="mandatory" defaultChecked={crit.mandatory} /> Mandatory: cannot be marked Not Applicable</label>
          <label className="check"><input type="checkbox" name="active" defaultChecked={crit.active !== false} /> Active</label>
          <p className="small faint">Default weights: {PRIORITIES.map(p => `${p} ${weights[p]}`).join(" · ")}. Changing priority applies its default weight; you can override it.</p>
        </>}
      </Modal>
    </>
  );
}
