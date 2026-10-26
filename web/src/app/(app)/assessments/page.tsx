import { Suspense } from "react";
import Loading from "../loading";
import { requireRole } from "@/lib/auth";
import { listAssessments } from "@/lib/data";
import { PageHead } from "@/components/ui";
import { AssessmentsTable } from "./AssessmentsTable";

export const metadata = { title: "Assessments" };

async function Assessments() {
  const me = await requireRole("iaqc", "cmd");
  const list = await listAssessments(me.district);
  return (
    <>
      <PageHead title={me.role === "cmd" ? "Assessment history" : "Assessments"} sub={`${list.length} submitted reports. Every report is preserved exactly as submitted.`} />
      <AssessmentsTable list={list.map(a => ({ id: a.id, centre_id: a.centre_id, centre_name: a.centre_name, code: a.code, district: a.district, ac_name: a.ac_name,
        visit_date: a.visit_date, score: a.score, category: a.category, alerts: a.alerts.length, assessed: a.assessed, na: a.counts.NA, version: a.checklist_version, override: !!a.override, location: a.location && { status: a.location.status, flagged: a.location.flagged } }))} />
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><Assessments /></Suspense>;
}
