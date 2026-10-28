import { Suspense } from "react";
import { redirect } from "next/navigation";
import Loading from "../loading";
import { HOME, isPro, requireRole } from "@/lib/auth";
import { getDirectory } from "@/lib/data";
import { DirectoryManager } from "./DirectoryManager";

export const metadata = { title: "Directory" };

async function DirectoryPage() {
  const me = await requireRole("ac", "iaqc", "cmd", "dept");
  if (isPro(me)) redirect(HOME[me.role]); // PROs have no Directory access, even by typing the address
  const { entries, submissions, districts } = await getDirectory(me);
  const mode = me.role === "iaqc" ? "iaqc" : me.role === "ac" ? "ac" : "read";
  return <DirectoryManager entries={entries} submissions={submissions} districts={districts} mode={mode} myDistrict={me.district} />;
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><DirectoryPage /></Suspense>;
}
