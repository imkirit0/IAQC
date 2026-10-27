import { Suspense } from "react";
import Loading from "../loading";
import { requireRole } from "@/lib/auth";
import { canEditDir, getDirectory } from "@/lib/data";
import { DIRECTORY, type DirKind } from "@/lib/support";
import { DirectoryManager } from "./DirectoryManager";

export const metadata = { title: "Directory" };

async function DirectoryPage() {
  const me = await requireRole("ac", "iaqc", "cmd", "dept");
  const { entries, districts } = await getDirectory(me);
  const editable = (Object.keys(DIRECTORY) as DirKind[]).filter(k => canEditDir(me, k));
  return <DirectoryManager entries={entries} districts={districts} editable={editable} myDistrict={me.district} />;
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><DirectoryPage /></Suspense>;
}
