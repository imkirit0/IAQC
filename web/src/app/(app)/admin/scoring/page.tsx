import { Suspense } from "react";
import Loading from "../../loading";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { PageHead, Reveal } from "@/components/ui";
import { ScoringForm } from "./ScoringForm";

export const metadata = { title: "Scoring rules" };

async function ScoringPage() {
  await requireRole("iaqc");
  const st = await getSettings();
  return (
    <>
      <PageHead title="Scoring rules" sub="Thresholds and weights apply to future assessments. Submitted reports keep the rules they were scored with." />
      <div className="cols">
        <ScoringForm st={st} />
        <Reveal delay={0.1} className="card">
          <div className="hd"><h2>How the score is calculated</h2></div>
          <div className="bd">
            <p className="statement" style={{ fontSize: 19 }}>Compliance = earned points ÷ applicable maximum × 100.<br />Risk = 100 − compliance.</p>
            <ul style={{ paddingLeft: 18, lineHeight: 1.75, marginTop: 18, color: "var(--ink-2)" }}>
              <li>Each criterion carries a weight. Earned points = weight × response %.</li>
              <li><b>Not Applicable</b> responses are excluded from the maximum. Mandatory criteria cannot be marked Not Applicable.</li>
              <li>Unanswered criteria are never treated as compliant: incomplete reports cannot be submitted and receive no score.</li>
              <li>If every criterion is Not Applicable, the report is shown as <b>Unscorable</b>, not 100%.</li>
              <li>A Non-Compliant response on a <b>critical</b> criterion raises a critical-risk alert regardless of the overall score. Alerts read <i>Reported, pending verification</i> until reviewed.</li>
              <li>Remarks are required for Non-Compliant responses, and for Partially Compliant responses on Critical or High priority criteria.</li>
              <li>Centres without a valid assessment are <b>Not Assessed</b>, never low risk.</li>
              <li>Changing thresholds or response scoring creates a new checklist version that applies to future reports only.</li>
            </ul>
          </div>
        </Reveal>
      </div>
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense() {
  return <Suspense fallback={<Loading />}><ScoringPage /></Suspense>;
}
