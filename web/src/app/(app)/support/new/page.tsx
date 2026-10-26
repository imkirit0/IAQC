import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import Loading from "../../loading";
import { canRequest, HOME, requireRole } from "@/lib/auth";
import { getCentres, getSettings } from "@/lib/data";
import { Icon } from "@/components/Icon";
import { PageHead } from "@/components/ui";
import { RequestForm } from "./RequestForm";

export const metadata = { title: "New support request" };

type Props = { searchParams: Promise<{ centre?: string; visit?: string }> };

async function NewRequest({ searchParams }: Props) {
  const me = await requireRole("ac", "cmd");
  if (!canRequest(me)) redirect(HOME[me.role]);
  const [{ centre, visit }, centres, st] = await Promise.all([searchParams, me.role === "ac" ? getCentres({ acId: me.id }) : getCentres({ district: me.district }), getSettings()]);
  const mine = centres.filter(c => c.active).map(c => ({ id: c.id, code: c.code, name: c.name }));
  return (
    <div className="ac-wrap" style={{ maxWidth: 760 }}>
      <PageHead back={<Link href="/support" className="back"><Icon name="left" />Support requests</Link>} title="New support request"
        sub="Ask for training or other help from a department. The IAQA Coordinator assigns it and sets the deadlines; you can follow it here." />
      {mine.length ? <RequestForm centres={mine} departments={st.departments} centreId={Number(centre) || null} visitId={Number(visit) || null} />
        : <div className="card"><div className="empty"><b>No centres available</b>Support requests are raised for one of your centres. Ask the IAQA Coordinator to assign centres to you.</div></div>}
    </div>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense(props: Props) {
  return <Suspense fallback={<Loading />}><NewRequest {...props} /></Suspense>;
}
