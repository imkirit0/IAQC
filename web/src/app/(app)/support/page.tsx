import { Suspense } from "react";
import Link from "next/link";
import Loading from "../loading";
import { canRequest, requireRole } from "@/lib/auth";
import { getSupportRequests, type SupportItem } from "@/lib/data";
import { Icon } from "@/components/Icon";
import { Ledger, PageHead, Reveal } from "@/components/ui";
import { SupportTable } from "./SupportTable";

export const metadata = { title: "Support requests" };

const WORKING = ["Accepted", "In Progress", "On Hold", "Awaiting Clarification"];

/** Per department: volume, delivery within the deadline, and missed response / completion deadlines. */
function DeptPerformance({ rows }: { rows: SupportItem[] }) {
  const by = new Map<string, SupportItem[]>();
  rows.filter(r => r.assigned_department).forEach(r => by.set(r.assigned_department!, [...(by.get(r.assigned_department!) ?? []), r]));
  const hours = (rs: SupportItem[]) => {
    const t = rs.filter(r => r.assigned_at && r.responded_at).map(r => (Date.parse(r.responded_at!) - Date.parse(r.assigned_at!)) / 36e5);
    return t.length ? (t.reduce((a, b) => a + b, 0) / t.length).toFixed(1) + " h" : "—";
  };
  return (
    <Reveal delay={0.05} className="card" style={{ marginBottom: 22 }}>
      <div className="hd"><h2>Department performance</h2><span className="small faint">assigned requests</span></div>
      <div className="tw"><table>
        <thead><tr><th>Department</th><th className="right">Assigned</th><th className="right">Open</th><th className="right">Completed</th><th className="right">Within deadline</th><th className="right">Missed response</th><th className="right">Missed completion</th><th className="right">Avg. response</th></tr></thead>
        <tbody>{by.size ? [...by].sort(([a], [b]) => a.localeCompare(b)).map(([d, rs]) => {
          const done = rs.filter(r => r.status === "Completed");
          return (
            <tr key={d}><td data-l="Department">{d}</td><td data-l="Assigned" className="right mono">{rs.length}</td>
              <td data-l="Open" className="right mono">{rs.filter(r => !["Completed", "Rejected", "Cancelled"].includes(r.status)).length}</td>
              <td data-l="Completed" className="right mono">{done.length}</td><td data-l="Within deadline" className="right mono">{done.filter(r => !r.missedCompletion).length}</td>
              <td data-l="Missed response" className="right mono">{rs.filter(r => r.missedResponse).length}</td><td data-l="Missed completion" className="right mono">{rs.filter(r => r.missedCompletion).length}</td>
              <td data-l="Avg. response" className="right mono">{hours(rs)}</td></tr>
          );
        }) : <tr><td data-l="" colSpan={8} className="empty">No requests have been assigned yet.</td></tr>}</tbody>
      </table></div>
    </Reveal>
  );
}

async function SupportPage() {
  const me = await requireRole("ac", "cmd", "iaqc", "dept");
  const rows = await getSupportRequests(me);
  const monitor = me.role === "iaqc" || (me.role === "cmd" && !me.district);
  const aso = me.role === "cmd" && !!me.district;
  const n = (f: (r: SupportItem) => boolean) => rows.filter(f).length;
  const title = me.role === "dept" ? `${me.department ?? "Department"} requests` : monitor ? "Support requests" : aso ? `Support requests, ${me.district}` : "My support requests";
  const sub = me.role === "iaqc" ? "Review new requests, assign them to a department with response and completion deadlines, and verify delivered support."
    : monitor ? "Every support request, its deadlines and its full history. Monitoring only."
    : aso ? "Support you and your district's Area Coordinators have requested, and the full history of each."
    : me.role === "dept" ? "Requests assigned to your department. Accept, record progress and record the support delivered."
    : "Training and other support you have requested, and where each one stands.";
  return (
    <>
      <PageHead title={title} sub={sub}>
        {canRequest(me) && <Link className="btn primary" href="/support/new"><Icon name="plus" />New support request</Link>}
      </PageHead>
      {monitor ? <>
        <Ledger cells={[
          { label: "Total requests", value: rows.length }, { label: "Newly submitted", value: n(r => r.status === "Submitted") },
          { label: "Awaiting assignment", value: n(r => ["Submitted", "Under Review", "Rejected"].includes(r.status)) }, { label: "Awaiting acceptance", value: n(r => r.status === "Assigned") },
          { label: "In progress", value: n(r => WORKING.includes(r.status)) }, { label: "Awaiting verification", value: n(r => r.status === "Completed - Awaiting Verification") },
          { label: "Completed", value: n(r => r.status === "Completed"), tone: "g" }, { label: "Overdue", value: n(r => r.overdue), tone: "c" },
        ]} />
        <DeptPerformance rows={rows} />
      </> : me.role === "dept" ? (
        <Ledger cells={[
          { label: "Awaiting acceptance", value: n(r => r.status === "Assigned") }, { label: "In progress", value: n(r => WORKING.includes(r.status)) },
          { label: "Awaiting verification", value: n(r => r.status === "Completed - Awaiting Verification") }, { label: "Completed", value: n(r => r.status === "Completed"), tone: "g" },
          { label: "Overdue", value: n(r => r.overdue), tone: "c" },
        ]} />
      ) : n(r => r.requester_id === me.id && r.status === "Awaiting Clarification") > 0 && (
        <div className="banner warn"><Icon name="info" /><div><b>{n(r => r.requester_id === me.id && r.status === "Awaiting Clarification")} request(s) need your answer.</b> Open the request to reply to the clarification.</div></div>
      )}
      <SupportTable rows={rows} monitor={monitor || aso} />
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><SupportPage /></Suspense>;
}
