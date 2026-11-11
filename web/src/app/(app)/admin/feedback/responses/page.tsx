import { Suspense } from "react";
import Form from "next/form";
import Link from "next/link";
import Loading from "../../../loading";
import { requireRole } from "@/lib/auth";
import { FEEDBACK_PAGE_SIZE, feedbackCounts, listFeedback, type FbFilter } from "@/lib/data";
import { answerText } from "@/lib/feedback";
import { fmtDT } from "@/lib/format";
import { Ledger, PageHead } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { FeedbackTabs } from "../Tabs";

export const metadata = { title: "Feedback responses" };

type Props = { searchParams: Promise<FbFilter & { page?: string }> };

async function Responses({ searchParams }: Props) {
  await requireRole("iaqc");
  const sp = await searchParams, page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const filter: FbFilter = { status: sp.status, from: sp.from, to: sp.to, q: sp.q };
  const query = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => !!e[1]));
  const [{ rows, matched }, counts] = await Promise.all([listFeedback(filter, page), feedbackCounts()]);
  const pages = Math.max(1, Math.ceil(matched / FEEDBACK_PAGE_SIZE));
  const pageHref = (p: number) => `?${new URLSearchParams([...query, ["page", String(p)]])}`;
  const exportHref = (format: string) => `/admin/feedback/export?${new URLSearchParams([...query, ["format", format]])}`;
  return (
    <>
      <PageHead title="Feedback responses" sub="Every submission, newest first, with its original questions. Open one to review and verify it." />
      <FeedbackTabs on="/admin/feedback/responses" />
      <Ledger cells={[{ label: "Total submissions", value: counts.total }, { label: "Pending verification", value: counts.pending, tone: "y" }, { label: "Verified", value: counts.verified, tone: "g" }]} />
      <div className="card">
        <Form action="" className="filters">
          <select name="status" defaultValue={sp.status ?? ""} aria-label="Verification status"><option value="">All statuses</option><option>Pending Verification</option><option>Verified</option></select>
          <label className="row small" style={{ gap: 6 }}>From<input type="date" name="from" defaultValue={sp.from} /></label>
          <label className="row small" style={{ gap: 6 }}>To<input type="date" name="to" defaultValue={sp.to} /></label>
          <div className="search"><Icon name="search" /><input type="search" name="q" defaultValue={sp.q} placeholder="Search answers" aria-label="Search answers" /></div>
          <button className="btn sm">Apply</button>
          <span className="spacer" />
          <a className="btn sm" href={exportHref("xlsx")}><Icon name="down" />Excel</a>
          <a className="btn sm" href={exportHref("csv")}><Icon name="down" />CSV</a>
        </Form>
        <div className="tw"><table>
          <thead><tr><th>No.</th><th>Submitted</th><th>Status</th><th>Answers</th><th>Form</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td data-l="No." className="nowrap">#{r.id}</td>
              <td data-l="Submitted" className="nowrap small">{fmtDT(r.submitted_at)}</td>
              <td data-l="Status"><span className={`chip ${r.status === "Verified" ? "ok" : "High"}`}>{r.status}</span></td>
              <td data-l="Answers" className="small" style={{ maxWidth: 420 }}>{Object.values(r.answers).map(answerText).join(" · ").slice(0, 140)}</td>
              <td data-l="Form" className="small nowrap">Version {r.version}</td>
              <td data-l="" className="right"><Link className="btn sm" href={`/admin/feedback/responses/${r.id}`}>Open</Link></td>
            </tr>
          ))}
          {!rows.length && <tr><td data-l="" colSpan={6} className="empty"><b>No responses</b>{counts.total ? "Nothing matches these filters." : "Submissions will appear here."}</td></tr>}</tbody>
        </table></div>
      </div>
      <nav className="row" aria-label="Response pages" style={{ justifyContent: "space-between", marginTop: 14 }}>
        <span className="small faint">{matched} matching · page {page} of {pages}</span>
        <span className="row" style={{ gap: 8 }}>
          {page > 1 && <Link className="btn sm" href={pageHref(page - 1)}>Previous</Link>}
          {page < pages && <Link className="btn sm" href={pageHref(page + 1)}>Next</Link>}
        </span>
      </nav>
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense(props: Props) {
  return <Suspense fallback={<Loading />}><Responses {...props} /></Suspense>;
}
