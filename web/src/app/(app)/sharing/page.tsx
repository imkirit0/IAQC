import { Suspense } from "react";
import Loading from "../loading";
import { isPro, requireRole } from "@/lib/auth";
import { getShares, shareRecipients } from "@/lib/data";
import { SharingBoard } from "./SharingBoard";

export const metadata = { title: "Information sharing" };

async function SharingPage() {
  const me = await requireRole("ac", "iaqc", "cmd", "dept");
  const [items, recipients] = await Promise.all([getShares(), shareRecipients(me)]);
  const sender = me.role === "ac" || isPro(me);
  return <SharingBoard items={items} recipients={recipients} meId={me.id} sender={sender} to={me.role === "ac" ? "PRO" : "Area Coordinator"} canDelete={me.role === "iaqc"} />;
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><SharingPage /></Suspense>;
}
