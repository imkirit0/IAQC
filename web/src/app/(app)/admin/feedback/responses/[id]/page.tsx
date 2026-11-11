import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Loading from "../../../../loading";
import { requireRole } from "@/lib/auth";
import { getFeedbackResponse } from "@/lib/data";
import { answerText, FB_TYPES, type FbFile, type FbQuestion, type FbAnswer } from "@/lib/feedback";
import { fmtDT } from "@/lib/format";
import { PageHead } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { FileButton, VerifyButton } from "./ResponseActions";

export const metadata = { title: "Feedback response" };

type Props = { params: Promise<{ id: string }> };

function outOf(q: FbQuestion, a: FbAnswer) {
  return q.type === "stars" || q.type === "scale" ? `${a} out of ${q.max}` : answerText(a);
}

async function Response({ params }: Props) {
  await requireRole("iaqc");
  const id = Number((await params).id);
  const r = Number.isSafeInteger(id) ? await getFeedbackResponse(id) : null;
  if (!r) notFound();
  const verified = r.status === "Verified";
  return (
    <>
      <PageHead title={`Response #${r.id}`} sub={`Submitted ${fmtDT(r.submitted_at)} on form version ${r.version}`} back={<Link href="/admin/feedback/responses" className="back"><Icon name="left" />Responses</Link>}>
        {!verified && <VerifyButton id={r.id} />}
      </PageHead>
      <div className="card" style={{ marginBottom: 18 }}><div className="bd row">
        <span className={`chip ${verified ? "ok" : "High"}`}>{r.status}</span>
        <span className="small muted">{verified ? `Verified ${fmtDT(r.verified_at)} by ${r.verifier}` : "Awaiting your review"}</span>
      </div></div>
      <div className="card">
        <div className="fb-sec"><h2>{r.form.title}</h2></div>
        {r.form.items.map(it => {
          if (it.kind === "s") return <div key={it.id} className="fb-sec"><h2>{it.title}</h2>{it.help && <p className="small muted" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{it.help}</p>}</div>;
          const a = r.answers[it.id];
          return (
            <div key={it.id} className="fb-q">
              <div className="t">{it.title}</div>
              <div className="small faint" style={{ marginBottom: 6 }}>{FB_TYPES[it.type]}</div>
              {a == null ? <span className="faint">Not answered</span> : it.type === "file" ? <FileButton id={r.id} questionId={it.id} name={(a as FbFile).name} /> : <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{outOf(it, a)}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense(props: Props) {
  return <Suspense fallback={<Loading />}><Response {...props} /></Suspense>;
}
