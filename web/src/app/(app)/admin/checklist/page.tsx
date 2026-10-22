import { Suspense } from "react";
import Loading from "../../loading";
import { requireRole } from "@/lib/auth";
import { getChecklist, getSettings } from "@/lib/data";
import { ChecklistManager } from "./ChecklistManager";

export const metadata = { title: "Checklist" };

async function ChecklistPage() {
  await requireRole("iaqc");
  const [sections, settings] = await Promise.all([getChecklist(true), getSettings()]);
  return <ChecklistManager sections={sections} version={settings.checklist_version} weights={settings.priority_weights} />;
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><ChecklistPage /></Suspense>;
}
