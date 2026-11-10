"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RefCategory, RefItem, RefVersion } from "@/lib/data";
import { REF_FILE_TYPES, refFileError } from "@/lib/support";
import { deleteRefCategory, deleteRefItem, refFileUrl, saveRefCategory, saveRefItem } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { PageHead } from "@/components/ui";
import { fmtDT } from "@/lib/format";

/** The IAQA Coordinator maintains the library (canManage); everyone else reads it. */
export function ReferenceManager({ categories, items, canManage }: { categories: RefCategory[]; items: RefItem[]; canManage: boolean }) {
  const router = useRouter(), toast = useToast();
  const [cat, setCat] = useState(""), [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<RefItem> | null>(null), [history, setHistory] = useState<RefItem | null>(null), [naming, setNaming] = useState<Partial<RefCategory> | null>(null);
  const catName = new Map(categories.map(c => [c.id, c.name])), current = categories.find(c => c.id === Number(cat)), s = q.trim().toLowerCase();
  const rows = items.filter(i => (!cat || i.category_id === Number(cat)) && (!s || `${i.title} ${i.content} ${i.file_name ?? ""} ${catName.get(i.category_id)}`.toLowerCase().includes(s)));

  async function open(v: RefVersion) {
    const r = await refFileUrl(v.id);
    if (r.error) return toast(r.error, true);
    window.location.assign(r.data!.url as string); // a download link: the page stays where it is
  }
  const file = (v: RefVersion) => v.file_name && <button type="button" className="btn sm quiet" onClick={() => open(v)}><Icon name="down" />{v.file_name}</button>;

  async function removeItem(i: RefItem) {
    if (!window.confirm(`Delete "${i.title}" with its update history${i.history.length ? ` (${i.history.length} earlier version${i.history.length === 1 ? "" : "s"})` : ""}? This cannot be undone.`)) return;
    const r = await deleteRefItem(i.item_id);
    if (r.error) return toast(r.error, true);
    toast("Reference data deleted"); router.refresh();
  }
  async function removeCategory(c: RefCategory) {
    if (!window.confirm(`Delete the category "${c.name}"?`)) return;
    const r = await deleteRefCategory(c.id);
    if (r.error) return toast(r.error, true);
    toast("Category deleted"); setCat(""); router.refresh();
  }

  return (
    <>
      <PageHead title="Reference data" sub={canManage ? "The common reference library for IAQA reviews and centre operations. You maintain it; all other users can view it."
        : "The common reference library for IAQA reviews and centre operations, maintained by the IAQA Coordinator."}>
        {canManage && <div className="row">
          <button className="btn" onClick={() => setNaming({})}><Icon name="plus" />Add category</button>
          {categories.length > 0 && <button className="btn primary" onClick={() => setEditing({ category_id: current?.id })}><Icon name="plus" />Add reference data</button>}
        </div>}
      </PageHead>

      <div className="card">
        <div className="filters">
          <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({items.filter(i => i.category_id === c.id).length})</option>)}</select>
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, details or file name" aria-label="Search reference data" /></div>
          {canManage && current && <><button className="btn sm" onClick={() => setNaming(current)}>Rename category</button><button className="btn sm quiet" onClick={() => removeCategory(current)}>Delete category</button></>}
          <span className="spacer" /><span className="small faint">{rows.length} shown</span>
        </div>
        <div className="tw"><table>
          <thead><tr><th>Category</th><th>Reference data</th><th>File</th><th>Last updated</th><th /></tr></thead>
          <tbody>{rows.map(i => (
            <tr key={i.item_id}>
              <td data-l="Category">{catName.get(i.category_id)}</td>
              <td data-l="Reference data" style={{ minWidth: 260 }}><b>{i.title}</b>{i.content && <div className="small" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{i.content}</div>}</td>
              <td data-l="File">{file(i) || <span className="faint">—</span>}</td>
              <td data-l="Last updated" className="small nowrap">{fmtDT(i.updated_at)}<div className="faint">{i.by}</div></td>
              <td data-l="" className="nowrap right">
                <button className="btn sm quiet" onClick={() => setHistory(i)}>History {i.history.length + 1}</button>
                {canManage && <>{" "}<button className="btn sm quiet" onClick={() => removeItem(i)}>Delete</button>{" "}<button className="btn sm" onClick={() => setEditing(i)}>Update</button></>}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td data-l="" colSpan={5} className="empty"><b>No reference data</b>
            {items.length ? "Nothing matches this category or search." : !canManage ? "Nothing has been added yet." : categories.length ? "Add the first item with the button above." : "Start by adding a category."}</td></tr>}</tbody>
        </table></div>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} wide title={editing?.item_id ? "Update reference data" : "Add reference data"} submitLabel={editing?.item_id ? "Save update" : "Add"}
        onSubmit={async f => {
          const fd = new FormData(f), up = fd.get("file") as File;
          const err = up?.size ? refFileError(up.name, up.size) : null; // checked here first so an oversized file is not sent at all
          if (err) return err;
          const r = await saveRefItem(fd);
          if (r.error) return r.error;
          toast(editing?.item_id ? "Reference data updated" : "Reference data added"); router.refresh();
        }}>
        {editing && <>
          <input type="hidden" name="id" value={editing.item_id ?? ""} />
          {editing.item_id && <p className="small muted">Saving records a new version with your name and the time. Earlier versions stay in the history.</p>}
          <label className="f"><span>Category</span><select name="category_id" required defaultValue={editing.category_id ?? ""}>
            <option value="" disabled>Choose a category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="f"><span>Title</span><input name="title" required maxLength={150} defaultValue={editing.title} /></label>
          <label className="f"><span>Details</span><textarea name="content" rows={7} maxLength={20000} defaultValue={editing.content} placeholder="Figures, notes or instructions. Optional when a file is attached." /></label>
          <label className="f"><span>File (optional, up to 4 MB: {REF_FILE_TYPES.join(", ")})</span><input type="file" name="file" accept={REF_FILE_TYPES.map(t => `.${t}`).join(",")} /></label>
          {editing.file_name && <>
            <p className="small faint" style={{ marginTop: -6 }}>Current file: {editing.file_name}. It is kept unless you choose a new one.</p>
            <label className="check"><input type="checkbox" name="remove_file" /> Remove the current file from this update</label>
          </>}
        </>}
      </Modal>

      <Modal open={!!history} onClose={() => setHistory(null)} wide title={`History: ${history?.title ?? ""}`}>
        {history && <ul className="mini-list">{[history, ...history.history].map((v, n) => (
          <li key={v.id}>
            <div className="row" style={{ gap: 8 }}><b>{fmtDT(v.updated_at)}</b><span className="small faint">{v.by}</span>{n === 0 && <span className="chip ok">Current</span>}</div>
            <div style={{ marginTop: 4, fontWeight: 600 }}>{v.title}</div>
            {v.content && <div className="small muted" style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{v.content}</div>}
            {v.file_name && <div style={{ marginTop: 6 }}>{file(v)}</div>}
          </li>
        ))}</ul>}
      </Modal>

      <Modal open={!!naming} onClose={() => setNaming(null)} title={naming?.id ? "Rename category" : "Add category"} submitLabel={naming?.id ? "Save" : "Add"} onSubmit={async f => {
        const r = await saveRefCategory(naming?.id ?? null, formData(f).name);
        if (r.error) return r.error;
        toast(naming?.id ? "Category renamed" : "Category added"); router.refresh();
      }}>
        <label className="f"><span>Category name</span><input name="name" required maxLength={80} defaultValue={naming?.name} /></label>
      </Modal>
    </>
  );
}
