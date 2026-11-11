import { Suspense } from "react";
import { connection } from "next/server";
import { feedbackTicket, getPublicFeedback } from "@/lib/data";
import { FeedbackForm } from "./FeedbackForm";

export const metadata = { title: "Student feedback", robots: { index: false, follow: false } };

// Always read per request, so students get the latest published form and their own ticket.
async function PublicForm() {
  await connection();
  const open = await getPublicFeedback();
  if (!open) return <div className="card"><div className="empty"><b>Feedback collection is currently closed</b>Please check back later. Thank you for your interest.</div></div>;
  return <FeedbackForm form={open.form} version={open.version} ticket={feedbackTicket()} />;
}

export default function FeedbackPage() {
  return (
    <main className="fb-page">
      <div className="fb-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="fb-brand"><img src="/brand/gtec-logo.png" alt="G-TEC Education" width={50} height={34} /><span>IAQA Student Feedback</span></div>
        <Suspense fallback={<div className="card"><div className="empty">Loading the form…</div></div>}><PublicForm /></Suspense>
      </div>
    </main>
  );
}
