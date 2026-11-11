import { Suspense } from "react";
import Loading from "../loading";
import { requireRole } from "@/lib/auth";
import { getCentres, getCentreStatuses } from "@/lib/data";
import { PageHead } from "@/components/ui";
import { CentreCards } from "./CentreCards";

export const metadata = { title: "My centres" };

async function MyCentres() {
  const me = await requireRole("ac");
  const centres = await getCentres({ acId: me.id }), statuses = await getCentreStatuses(centres.map(c => c.id));
  return (
    <div className="ac-wrap">
      <PageHead title="My centres" sub={`${centres.length} centre${centres.length === 1 ? "" : "s"} assigned to you. Drafts stay on this device until submitted; submitted reports are final.`} />
      <CentreCards userId={me.id} centres={centres.map(c => ({ id: c.id, code: c.code, name: c.name, location: c.location, district: c.district, last_visit: c.last_visit ?? null, status: statuses[c.id] ?? null }))} />
    </div>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><MyCentres /></Suspense>;
}
