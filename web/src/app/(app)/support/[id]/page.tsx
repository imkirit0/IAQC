import { Fragment, Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Loading from "../../loading";
import { requireRole } from "@/lib/auth";
import { getDeptUsers, getSettings, getSupportRequest, type SupportEvent } from "@/lib/data";
import { fmtDate, fmtDT, ref } from "@/lib/format";
import { ACTIONS, actionsFor, srRef, type ActionName } from "@/lib/support";
import { Icon } from "@/components/Icon";
import { PageHead, Reveal } from "@/components/ui";
import { Overdue, PriorityTag, StatusTag } from "../SupportTable";
import { ActionPanel } from "./ActionPanel";

export const metadata = { title: "Support request" };

const ACTOR: Record<string, string> = { requester: "Requester", iaqc: "IAQA Coordinator", dept: "Department" };
const DELIVERY: [string, string][] = [["date", "Delivered on"], ["topic", "Training topic"], ["mode", "Delivery mode"], ["participants", "Participants / staff covered"], ["description", "Support provided"], ["outcome", "Outcome"]];

function What({ e, people }: { e: SupportEvent; people: Map<string, string> }) {
  const d = (e.data ?? {}) as Record<string, string | null>;
  if (e.action === "create") return <>Request submitted</>;
  if (["assign", "reassign", "deadlines"].includes(e.action)) return <>
    {e.action === "deadlines" ? "Deadlines changed" : `${e.action === "assign" ? "Assigned" : "Reassigned"} to ${d.department}${d.assignee_id ? `, ${people.get(d.assignee_id) ?? "in-charge"}` : ""}`}
    <div className="small faint">Response by {fmtDT(d.response_due)}{d.completion_due ? ` · complete by ${fmtDT(d.completion_due)}` : ""}</div></>;
  if (e.action === "complete") return <>Support delivered: recorded</>;
  if (e.action === "progress" && d.estimated_completion) return <>Progress update<div className="small faint">Estimated completion {fmtDate(d.estimated_completion)}</div></>;
  return <>{ACTIONS[e.action as ActionName]?.label ?? e.action}</>;
}

async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("ac", "cmd", "iaqc", "dept");
  const r = await getSupportRequest(me, Number((await params).id));
  if (!r) notFound(); // also when this user may not see it
  const acts = actionsFor(r.actors, r.status);
  const [st, depts] = await Promise.all([getSettings(), acts.some(a => a === "assign" || a === "reassign") ? getDeptUsers(r.district) : []]);
  const people = r.names;
  const canSeeAudit = me.role === "iaqc" || me.role === "cmd"; // department in-charges never see audit reports
  const late = (missed: boolean) => (missed ? <span className="late"> · missed</span> : null);

  return (
    <>
      <PageHead back={<><Link href="/support" className="back"><Icon name="left" />Support requests</Link><div className="code">{srRef(r.id)} · {r.category}</div></>}
        title={r.title} sub={`${r.centre_name} (${r.centre_code}) · requested by ${r.requester}, ${r.requester_role}`}>
        <div className="row"><PriorityTag p={r.priority} /><StatusTag s={r.status} />{r.overdue && <Overdue />}</div>
      </PageHead>
      {r.status === "Awaiting Clarification" && r.actors.includes("requester") &&
        <div className="banner warn"><Icon name="info" /><div><b>Clarification requested.</b> {r.events.findLast(e => e.action === "clarify")?.note} Use <i>Answer clarification</i> to reply.</div></div>}
      <div className="with-rail"><div>
        <Reveal className="card">
          <div className="hd"><h2>Request</h2></div>
          <div className="bd">
            <dl className="info-list" style={{ marginBottom: 18 }}>
              <dt>Submitted</dt><dd>{fmtDT(r.created_at)}</dd>
              <dt>Requested department</dt><dd>{r.department}</dd>
              <dt>Category</dt><dd>{r.category}</dd>
              <dt>Centre</dt><dd>{r.centre_name} · {r.centre_code}{r.district ? ` · ${r.district}` : ""}</dd>
              <dt>Preferred date</dt><dd>{fmtDate(r.preferred_date)}</dd>
              {r.assessment_id && <><dt>Visit report</dt><dd>{canSeeAudit ? <Link href={`/scorecard/${r.centre_id}?a=${r.assessment_id}`}>{ref(r.assessment_id)}</Link> : ref(r.assessment_id)}</dd></>}
            </dl>
            <p className="statement" style={{ fontSize: 16, whiteSpace: "pre-wrap" }}>{r.remarks}</p>
          </div>
        </Reveal>
        <Reveal delay={0.05} className="card">
          <div className="hd"><h2>Assignment and deadlines</h2></div>
          <div className="bd">{r.assigned_department ? (
            <dl className="info-list">
              <dt>Department</dt><dd>{r.assigned_department}</dd>
              <dt>In-charge</dt><dd>{r.assignee ?? "Any in-charge of the department"}</dd>
              <dt>Assigned</dt><dd>{fmtDT(r.assigned_at)}</dd>
              <dt>Response due</dt><dd>{fmtDT(r.response_due)}{late(r.missedResponse)}</dd>
              <dt>Responded</dt><dd>{fmtDT(r.responded_at)}</dd>
              <dt>Accepted</dt><dd>{fmtDT(r.accepted_at)}</dd>
              <dt>Completion due</dt><dd>{fmtDT(r.completion_due)}{late(r.missedCompletion)}</dd>
              <dt>Estimated completion</dt><dd>{fmtDate(r.estimated_completion)}</dd>
              <dt>Delivery recorded</dt><dd>{fmtDT(r.delivered_at)}</dd>
              {st.support_verification && <><dt>Verified</dt><dd>{fmtDT(r.verified_at)}</dd></>}
            </dl>
          ) : <p className="small muted" style={{ margin: 0 }}>Not yet assigned. The IAQA Coordinator assigns each request to a department and sets its deadlines.</p>}</div>
        </Reveal>
        {r.delivery && (
          <Reveal delay={0.08} className="card">
            <div className="hd"><h2>Support delivered</h2></div>
            <div className="bd"><dl className="info-list">{DELIVERY.filter(([k]) => r.delivery![k]).map(([k, label]) => <Fragment key={k}><dt>{label}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{k === "date" ? fmtDate(r.delivery![k]) : r.delivery![k]}</dd></Fragment>)}</dl></div>
          </Reveal>
        )}
      </div>
      <aside className="rail">
        {acts.length > 0 && (
          <Reveal delay={0.06} className="card">
            <div className="hd"><h3>Actions</h3></div>
            <div className="bd"><ActionPanel id={r.id} actions={acts} training={r.category === "Training"} departments={st.departments} users={depts}
              current={{ department: r.assigned_department ?? r.department, assignee_id: r.assignee_id, response_due: r.response_due, completion_due: r.completion_due }} /></div>
          </Reveal>
        )}
        <Reveal delay={0.1} className="card">
          <div className="hd"><h3>History</h3><span className="spacer" /><span className="small faint">permanent record</span></div>
          <div className="bd"><ol className="timeline">{r.events.map(e => (
            <li key={e.id}>
              <div style={{ fontWeight: 600 }}><What e={e} people={people} /></div>
              {e.from_status !== e.to_status && e.to_status && <div className="small">{e.from_status ? `${e.from_status} → ` : ""}{e.to_status}</div>}
              {e.note && e.action !== "create" && <div className="small muted" style={{ marginTop: 2, whiteSpace: "pre-wrap" }}>{e.note}</div>}
              <div className="small faint" style={{ marginTop: 2 }}>{e.by} · {ACTOR[e.actor] ?? e.actor} · {fmtDT(e.at)}</div>
            </li>
          ))}</ol></div>
        </Reveal>
      </aside></div>
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Loading />}><RequestPage {...props} /></Suspense>;
}
