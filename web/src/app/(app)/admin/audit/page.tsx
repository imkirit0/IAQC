import { Suspense } from "react";
import Link from "next/link";
import Loading from "../../loading";
import { requireRole } from "@/lib/auth";
import { AUDIT_PAGE_SIZE, getAudit } from "@/lib/data";
import { fmtDT } from "@/lib/format";
import { PageHead, Reveal } from "@/components/ui";

export const metadata = { title: "Audit log" };

type Props = { searchParams: Promise<{ page?: string }> };

async function AuditPage({ searchParams }: Props) {
  await requireRole("iaqc");
  const page = Math.max(1, Math.floor(Number((await searchParams).page)) || 1);
  const { log, total } = await getAudit(page);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const first = total ? (page - 1) * AUDIT_PAGE_SIZE + 1 : 0, last = Math.min(page * AUDIT_PAGE_SIZE, total);
  return (
    <>
      <PageHead title="Audit log" sub="Sign-ins, refused access and every administrative change, most recent first." />
      <Reveal className="card"><div className="tw"><table>
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>{log.map(l => (
          <tr key={l.id}><td data-l="Time" className="nowrap small">{fmtDT(l.at)}</td><td data-l="User" className="small">{l.username ?? "—"}</td>
            <td data-l="Action"><span className={`chip ${/DENIED|FAILED/.test(l.action) ? "Critical" : ""}`}>{l.action}</span></td><td data-l="Detail" className="small">{l.detail}</td></tr>
        ))}</tbody>
      </table></div></Reveal>
      <nav className="row" aria-label="Audit log pages" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
        <span className="small faint">{first}–{last} of {total} · page {page} of {pages}</span>
        <span className="row" style={{ gap: 8 }}>
          {page > 1 ? <Link className="btn sm" href={`?page=${page - 1}`}>Previous</Link> : <span className="btn sm" aria-disabled="true" style={{ opacity: .45 }}>Previous</span>}
          {page < pages ? <Link className="btn sm" href={`?page=${page + 1}`}>Next</Link> : <span className="btn sm" aria-disabled="true" style={{ opacity: .45 }}>Next</span>}
        </span>
      </nav>
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense(props: Props) {
  return <Suspense fallback={<Loading />}><AuditPage {...props} /></Suspense>;
}
