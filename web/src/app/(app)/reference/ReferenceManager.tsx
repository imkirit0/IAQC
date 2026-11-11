"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RefCategory, RefItem, RefSheet, RefVersion } from "@/lib/data";
import { REF_FILE_TYPES, refFileError } from "@/lib/support";
import { deleteRefCategory, deleteRefItem, refFileUrl, refSheet, saveRefCategory, saveRefItem } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { PageHead } from "@/components/ui";
import { fmtDT } from "@/lib/format";

const SHEET_PAGE = 200; // rows added to the page at a time, so very long sheets stay quick to scroll

/** One spreadsheet as a table. The server sends only the rows this user may read, so search and filters cannot reach any others. */
function SheetTable({ versionId, limited }: { versionId: number; limited: boolean }) {
  const [sheet, setSheet] = useState<RefSheet | null>(null), [error, setError] = useState("");
  const [q, setQ] = useState(""), [aso, setAso] = useState(""), [shown, setShown] = useState(SHEET_PAGE);
  useEffect(() => {
    let live = true;
    refSheet(versionId).then(r => { if (live) { setError(r.error ?? ""); setSheet((r.data?.sheet as RefSheet) ?? null); } });
    return () => { live = false; };
  }, [versionId]);

  if (error) return <div className="empty">{error}</div>;
  if (!sheet) return <div className="empty">Loading table…</div>;
  if (!sheet.rows.length) return <div className="empty"><b>No records</b>{limited ? "This data has no rows for your ASO." : "This data has no rows."}</div>;
  const asos = [...new Set(sheet.rows.map(r => r.aso))].sort(), s = q.trim().toLowerCase();
  const rows = sheet.rows.filter(r => (!aso || r.aso === aso) && (!s || r.cells.join("\n").toLowerCase().includes(s)));
  return (
    <>
      <div className="filters">
        {asos.length > 1 && <select value={aso} onChange={e => { setAso(e.target.value); setShown(SHEET_PAGE); }} aria-label="ASO"><option value="">All ASOs</option>{asos.map(a => <option key={a}>{a}</option>)}</select>}
        <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => { setQ(e.target.value); setShown(SHEET_PAGE); }} placeholder="Search this table" aria-label="Search this table" /></div>
        <span className="spacer" /><span className="small faint">{rows.length} of {sheet.rows.length} records</span>
      </div>
      <div className="sheet" tabIndex={0} role="region" aria-label="Spreadsheet data">
        <table>
          <thead><tr>{sheet.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
          <tbody>{rows.slice(0, shown).map(r => <tr key={r.n}>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>)}
            {!rows.length && <tr><td colSpan={sheet.columns.length} className="empty">Nothing matches this search.</td></tr>}</tbody>
        </table>
      </div>
      {rows.length > shown && <div className="bd" style={{ textAlign: "center" }}><button type="button" className="btn sm" onClick={() => setShown(shown + SHEET_PAGE)}>Show more</button></div>}
    </>
  );
}

/** The IAQA Coordinator maintains the library (canManage); everyone else reads it. Spreadsheets appear as tables, limited to the viewer's ASOs when `limited`. */
export function ReferenceManager({ categories, items, canManage, limited }: { categories: RefCategory[]; items: RefItem[]; canManage: boolean; limited: boolean }) {
  const router = useRouter(), toast = useToast();
  const [cat, setCat] = useState(""), [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<RefItem> | null>(null), [history, setHistory] = useState<RefItem | null>(null), [naming, setNaming] = useState<Partial<RefCategory> | null>(null);
  const catName = new Map(categories.map(c => [c.id, c.name])), current = categories.find(c => c.id === Number(cat)), s = q.trim().toLowerCase();
  const [viewing, setViewing] = useState<number | null>(null); // the earlier version whose table is open in History
  const rows = items.filter(i => (!cat || i.category_id === Number(cat)) && (!s || `${i.title} ${i.content} ${i.file_name ?? ""} ${catName.get(i.category_id)}`.toLowerCase().includes(s)));

  async function open(v: RefVersion) {
    const r = await refFileUrl(v.id);
    if (r.error) return toast(r.error, true);
    if (r.data!.url) return window.location.assign(r.data!.url as string); // a download link: the page stays where it is
    const a = document.createElement("a"); // the viewer's own rows, built by the server
    a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${r.data!.base64}`;
    a.download = r.data!.name as string;
    a.click();
  }
  const file = (v: RefVersion) => v.file_name && <button type="button" className="btn sm quiet" onClick={() => open(v)}><Icon name="down" />{limited && v.sheet ? "Download my ASO's rows" : v.file_name}</button>;
  const controls = (i: RefItem) => <>
    <button className="btn sm quiet" onClick={() => setHistory(i)}>History {i.history.length + 1}</button>
    {canManage && <>{" "}<button className="btn sm quiet" onClick={() => removeItem(i)}>Delete</button>{" "}<button className="btn sm" onClick={() => setEditing(i)}>Update</button></>}
  </>;
  const sheets = rows.filter(i => i.sheet), plain = rows.filter(i => !i.sheet);

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
        : `The common reference library for IAQA reviews and centre operations, maintained by the IAQA Coordinator.${limited ? " Tables show your ASO's records." : ""}`}>
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
        {(plain.length > 0 || !sheets.length) && <div className="tw"><table>
          <thead><tr><th>Category</th><th>Reference data</th><th>File</th><th>Last updated</th><th /></tr></thead>
          <tbody>{plain.map(i => (
            <tr key={i.item_id}>
              <td data-l="Category">{catName.get(i.category_id)}</td>
              <td data-l="Reference data" style={{ minWidth: 260 }}><b>{i.title}</b>{i.content && <div className="small" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{i.content}</div>}</td>
              <td data-l="File">{file(i) || <span className="faint">—</span>}</td>
              <td data-l="Last updated" className="small nowrap">{fmtDT(i.updated_at)}<div className="faint">{i.by}</div></td>
              <td data-l="" className="nowrap right">{controls(i)}</td>
            </tr>
          ))}
          {!plain.length && <tr><td data-l="" colSpan={5} className="empty"><b>No reference data</b>
            {items.length ? "Nothing matches this category or search." : !canManage ? "Nothing has been added yet." : categories.length ? "Add the first item with the button above." : "Start by adding a category."}</td></tr>}</tbody>
        </table></div>}
      </div>

      {sheets.map(i => (
        <section key={i.item_id} className="card" style={{ marginTop: 16 }}>
          <div className="bd">
            <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}><div className="small faint">{catName.get(i.category_id)}</div><b>{i.title}</b></div>
              <div className="row" style={{ gap: 6 }}>{file(i)}{controls(i)}</div>
            </div>
            {i.content && <div className="small" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{i.content}</div>}
            <div className="small faint" style={{ marginTop: 6 }}>Last updated {fmtDT(i.updated_at)} by {i.by}</div>
          </div>
          <SheetTable key={i.id} versionId={i.id} limited={limited} />
        </section>
      ))}

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
          <p className="small faint" style={{ marginTop: -6 }}>Excel and CSV files are shown as a table (first sheet only). The first column must be named ASO Name, and every row needs an ASO from the Directory.</p>
          {editing.file_name && <>
            <p className="small faint" style={{ marginTop: -6 }}>Current file: {editing.file_name}. It is kept unless you choose a new one.</p>
            <label className="check"><input type="checkbox" name="remove_file" /> Remove the current file from this update</label>
          </>}
        </>}
      </Modal>

      <Modal open={!!history} onClose={() => { setHistory(null); setViewing(null); }} wide title={`History: ${history?.title ?? ""}`}>
        {history && <ul className="mini-list">{[history, ...history.history].map((v, n) => (
          <li key={v.id}>
            <div className="row" style={{ gap: 8 }}><b>{fmtDT(v.updated_at)}</b><span className="small faint">{v.by}</span>{n === 0 && <span className="chip ok">Current</span>}</div>
            <div style={{ marginTop: 4, fontWeight: 600 }}>{v.title}</div>
            {v.content && <div className="small muted" style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{v.content}</div>}
            {v.file_name && <div className="row" style={{ marginTop: 6, gap: 6 }}>{file(v)}{v.sheet && <button type="button" className="btn sm" onClick={() => setViewing(viewing === v.id ? null : v.id)}>{viewing === v.id ? "Hide table" : "View table"}</button>}</div>}
            {viewing === v.id && <div style={{ marginTop: 8 }}><SheetTable key={v.id} versionId={v.id} limited={limited} /></div>}
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
