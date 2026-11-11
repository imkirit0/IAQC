import { Suspense } from "react";
import Loading from "../loading";
import { requireRole } from "@/lib/auth";
import { getReference, refScope } from "@/lib/data";
import { ReferenceManager } from "./ReferenceManager";

export const metadata = { title: "Reference data" };

async function ReferencePage() {
  const me = await requireRole("ac", "iaqc", "cmd", "dept");
  const [{ categories, items }, scope] = await Promise.all([getReference(), refScope(me)]);
  return <ReferenceManager categories={categories} items={items} canManage={me.role === "iaqc"} limited={!!scope} />;
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><ReferencePage /></Suspense>;
}
