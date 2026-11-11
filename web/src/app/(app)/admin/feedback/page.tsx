import { Suspense } from "react";
import { headers } from "next/headers";
import QRCode from "qrcode";
import Loading from "../../loading";
import { requireRole } from "@/lib/auth";
import { getFeedbackForm } from "@/lib/data";
import { PageHead } from "@/components/ui";
import { FormBuilder } from "./FormBuilder";
import { FeedbackTabs } from "./Tabs";

export const metadata = { title: "Student feedback" };

async function FeedbackAdmin() {
  await requireRole("iaqc");
  const [f, h] = await Promise.all([getFeedbackForm(), headers()]);
  const link = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/feedback`;
  return (
    <>
      <PageHead title="Student feedback" sub="One form for all students, shared through one permanent link. Only you can manage it or see its responses." />
      <FeedbackTabs on="/admin/feedback" />
      <FormBuilder draft={f.draft} published={f.published} version={f.version} active={f.active} link={link} qr={await QRCode.toString(link, { type: "svg", margin: 1 })} />
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><FeedbackAdmin /></Suspense>;
}
