import { Suspense } from "react";
import Loading from "../../loading";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCentres, makeSnapshot } from "@/lib/data";
import { VisitForm } from "./VisitForm";

export const metadata = { title: "Visit report" };

async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireRole("ac");
  const { id } = await params;
  const [centres, snap] = await Promise.all([getCentres({ acId: me.id }), makeSnapshot()]);
  const centre = centres.find(c => c.id === Number(id));
  if (!centre) notFound(); // not assigned to this coordinator
  if (!snap.sections.length) return <div className="card"><div className="empty"><b>No active checklist</b>Please contact the IAQA Coordinator.</div></div>;
  return <VisitForm userId={me.id} centre={{ id: centre.id, name: centre.name, code: centre.code, location: centre.location, district: centre.district }} snap={snap} />;
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense(props: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Loading />}><VisitPage {...props} /></Suspense>;
}
