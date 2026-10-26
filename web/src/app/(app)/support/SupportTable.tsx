"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { fmtDate, fmtDT } from "@/lib/format";
import { SR_PRIORITIES, SR_STATUSES, srRef } from "@/lib/support";
import type { SupportItem } from "@/lib/data";

const STATUS_CLASS: Record<string, string> = { Completed: "b-green", Rejected: "b-grey", Cancelled: "b-grey", "Awaiting Clarification": "b-yellow", "On Hold": "b-yellow" };
export const StatusTag = ({ s }: { s: string }) => <span className={`badge ${STATUS_CLASS[s] ?? "b-grey"}`} style={STATUS_CLASS[s] ? undefined : { background: "var(--accent-soft)", color: "var(--accent)" }}>{s}</span>;
export const PriorityTag = ({ p }: { p: string }) => <span className={`chip ${p === "Urgent" ? "Critical" : p === "High" ? "High" : ""}`}>{p}</span>;
export const Overdue = () => <span className="alert"><Icon name="alert" />Overdue</span>;

const PAGE = 25;
const RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2 };
const SORTS: Record<string, (a: SupportItem, b: SupportItem) => number> = {
  newest: (a, b) => b.id - a.id, oldest: (a, b) => a.id - b.id,
  priority: (a, b) => RANK[a.priority] - RANK[b.priority] || b.id - a.id,
  response: (a, b) => (a.response_due ?? "~").localeCompare(b.response_due ?? "~"),
  completion: (a, b) => (a.completion_due ?? "~").localeCompare(b.completion_due ?? "~"),
  updated: (a, b) => b.updated_at.localeCompare(a.updated_at),
};

export function SupportTable({ rows, monitor }: { rows: SupportItem[]; monitor: boolean }) {
  const [q, setQ] = useState(""), [status, setStatus] = useState(""), [dept, setDept] = useState(""), [prio, setPrio] = useState("");
  const [flag, setFlag] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [sort, setSort] = useState("newest"), [page, setPage] = useState(1);
  const depts = [...new Set(rows.flatMap(r => [r.department, r.assigned_department ?? ""]).filter(Boolean))].sort();
  const s = q.trim().toLowerCase();
  const list = rows.filter(r =>
    (!s || `${srRef(r.id)} ${r.title} ${r.centre_name} ${r.centre_code} ${r.requester} ${r.assignee ?? ""} ${r.category}`.toLowerCase().includes(s)) &&
    (!status || r.status === status) && (!dept || (r.assigned_department ?? r.department) === dept) && (!prio || r.priority === prio) &&
    (!from || r.created_at.slice(0, 10) >= from) && (!to || r.created_at.slice(0, 10) <= to) &&
    (!flag || (flag === "reassigned" ? r.reassigned > 0 : r[flag as "overdue" | "missedResponse" | "missedCompletion"])),
  ).sort(SORTS[sort]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE)), p = Math.min(page, pages), shown = list.slice((p - 1) * PAGE, p * PAGE);
  const set = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1); };

  return (
    <div className="card">
      <div className="filters">
        <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => set(setQ)(e.target.value)} placeholder="Search ref, title, centre or person" aria-label="Search requests" /></div>
        <select value={status} onChange={e => set(setStatus)(e.target.value)} aria-label="Status"><option value="">All statuses</option>{SR_STATUSES.map(x => <option key={x}>{x}</option>)}</select>
        <select value={dept} onChange={e => set(setDept)(e.target.value)} aria-label="Department"><option value="">All departments</option>{depts.map(x => <option key={x}>{x}</option>)}</select>
        <select value={prio} onChange={e => set(setPrio)(e.target.value)} aria-label="Priority"><option value="">All priorities</option>{SR_PRIORITIES.map(x => <option key={x}>{x}</option>)}</select>
        <select value={flag} onChange={e => set(setFlag)(e.target.value)} aria-label="Deadlines">
          <option value="">Any timeline</option><option value="overdue">Overdue now</option><option value="missedResponse">Missed response deadline</option>
          <option value="missedCompletion">Missed completion deadline</option>{monitor && <option value="reassigned">Reassigned</option>}
        </select>
        <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>From<input type="date" value={from} onChange={e => set(setFrom)(e.target.value)} aria-label="Submitted from" /></label>
        <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>To<input type="date" value={to} onChange={e => set(setTo)(e.target.value)} aria-label="Submitted to" /></label>
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="priority">Priority</option>
          <option value="response">Response deadline</option><option value="completion">Completion deadline</option><option value="updated">Last updated</option>
        </select>
        <span className="spacer" /><span className="small faint">{list.length} of {rows.length}</span>
      </div>
      <div className="tw">{shown.length ? (
        <table>
          <thead><tr><th>Request</th><th>Submitted</th>{monitor && <th>Requester</th>}<th>Centre</th><th>Department</th><th>Priority</th><th>Status</th><th>In-charge</th><th>Response due</th><th>Completion due</th><th>Updated</th></tr></thead>
          <tbody>{shown.map(r => (
            <tr key={r.id} className={r.overdue ? "alert-row" : ""}>
              <td data-l="Request"><Link href={`/support/${r.id}`}><b>{r.title}</b></Link><div className="code">{srRef(r.id)} · {r.category}</div></td>
              <td data-l="Submitted" className="nowrap small">{fmtDate(r.created_at)}</td>
              {monitor && <td data-l="Requester" className="small">{r.requester}<div className="faint">{r.requester_role}</div></td>}
              <td data-l="Centre" className="small">{r.centre_name}<div className="code">{r.centre_code}</div></td>
              <td data-l="Department" className="small">{r.assigned_department ?? r.department}{r.assigned_department && r.assigned_department !== r.department && <div className="faint">requested {r.department}</div>}</td>
              <td data-l="Priority"><PriorityTag p={r.priority} /></td>
              <td data-l="Status"><StatusTag s={r.status} />{r.overdue && <div style={{ marginTop: 4 }}><Overdue /></div>}</td>
              <td data-l="In-charge" className="small">{r.assignee ?? (r.assigned_department ? <span className="faint">Department</span> : <span className="faint">—</span>)}</td>
              <td data-l="Response due" className={`nowrap small${r.missedResponse ? " late" : ""}`}>{fmtDT(r.response_due)}</td>
              <td data-l="Completion due" className={`nowrap small${r.missedCompletion ? " late" : ""}`}>{fmtDT(r.completion_due)}</td>
              <td data-l="Updated" className="nowrap small faint">{fmtDT(r.updated_at)}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <div className="empty"><b>{rows.length ? "No matching requests" : "No support requests yet"}</b>{rows.length ? "Adjust the search or filters." : ""}</div>}</div>
      {pages > 1 && (
        <nav className="row" aria-label="Pages" style={{ justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid var(--rule)" }}>
          <span className="small faint">Page {p} of {pages}</span>
          <span className="row" style={{ gap: 8 }}>
            <button className="btn sm" disabled={p === 1} onClick={() => setPage(p - 1)}>Previous</button>
            <button className="btn sm" disabled={p === pages} onClick={() => setPage(p + 1)}>Next</button>
          </span>
        </nav>
      )}
    </div>
  );
}
