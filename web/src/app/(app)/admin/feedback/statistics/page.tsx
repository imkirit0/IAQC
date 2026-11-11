import { Suspense } from "react";
import Loading from "../../../loading";
import { requireRole } from "@/lib/auth";
import { allFeedback, feedbackVersions } from "@/lib/data";
import { FB_TYPES, feedbackStats } from "@/lib/feedback";
import { Ledger, PageHead } from "@/components/ui";
import { FeedbackTabs } from "../Tabs";

export const metadata = { title: "Feedback statistics" };

async function Statistics() {
  await requireRole("iaqc");
  const [rows, versions] = await Promise.all([allFeedback({}), feedbackVersions()]);
  const stats = feedbackStats(versions, rows), pending = rows.filter(r => r.status !== "Verified").length;
  return (
    <>
      <PageHead title="Feedback statistics" sub="A summary of every question across all form versions. A question that was reworded appears once, under its latest wording." />
      <FeedbackTabs on="/admin/feedback/statistics" />
      <Ledger cells={[{ label: "Total submissions", value: rows.length }, { label: "Pending verification", value: pending, tone: "y" }, { label: "Verified", value: rows.length - pending, tone: "g" }]} />
      {!stats.length && <div className="card"><div className="empty"><b>No statistics yet</b>Publish the form and collect responses to see them here.</div></div>}
      {stats.map(s => {
        const base = s.counts.reduce((n, c) => n + c[1], 0);
        return (
          <div key={s.id} className="card"><div className="bd">
            <b>{s.title}</b>
            <div className="small faint">{FB_TYPES[s.type]} · answered by {s.answered} of {rows.length}</div>
            {s.avg != null && <div className="small" style={{ marginTop: 6 }}>Average <b>{s.avg}</b> · lowest <b>{s.min}</b> · highest <b>{s.max}</b></div>}
            {s.counts.length > 0 && <ul className="fb-bars">{s.counts.map(([label, n]) => (
              <li key={label}><span>{label}</span><div className="bar"><i style={{ width: `${base ? (n / base) * 100 : 0}%` }} /></div><span>{n}</span></li>
            ))}</ul>}
          </div></div>
        );
      })}
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><Statistics /></Suspense>;
}
