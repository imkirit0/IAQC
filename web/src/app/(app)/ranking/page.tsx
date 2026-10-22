import { Suspense } from "react";
import Loading from "../loading";
import { requireRole } from "@/lib/auth";
import { getRanking } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { Ledger, PageHead } from "@/components/ui";
import { RankingTable } from "./RankingTable";
import { RiskRail } from "./RiskRail";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Risk ranking" };


async function RankingPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await requireRole("iaqc", "cmd");
  const { from, to } = await searchParams;
  const { centres, settings } = await getRanking(from, to);
  const n = (k: string) => centres.filter(c => c.category === k).length;
  const latest = centres.map(c => c.last_visit).filter(Boolean).sort().at(-1);
  return (
    <>
      <PageHead title={me.role === "cmd" ? "Centre ranking" : "Risk ranking"} sub={`${centres.length} active centres${latest ? ` · latest assessment ${fmtDate(latest)}` : " · no assessments submitted yet"}`}><PrintButton /></PageHead>
      <Ledger cells={[
        { label: "Active centres", value: centres.length }, { label: "Assessed", value: centres.filter(c => c.assessment_id).length },
        { label: "Green", value: n("Green"), tone: "g" }, { label: "Yellow", value: n("Yellow"), tone: "y" }, { label: "Red", value: n("Red"), tone: "r" },
        { label: "Critical alerts", value: centres.filter(c => c.alerts.length).length, tone: "c" },
        { label: "Pending visits", value: centres.filter(c => c.due).length, note: `not visited in last ${settings.visit_cycle_days} days` },
      ]} />
      <RiskRail centres={centres} />
      <RankingTable centres={centres} from={from ?? ""} to={to ?? ""} defaultDir={me.role === "cmd" ? -1 : 1} />
      <p className="small faint" style={{ marginTop: 14, maxWidth: "110ch" }}>
        Ranking places centres with critical alerts first, then by risk level (Red, Yellow, Green), then the lowest compliance score. A risk level set by IAQC is marked <b>Set by IAQC</b>. Centres without a valid assessment are shown as <b>Not Assessed</b>, never as low risk.
        Thresholds: Green ≥ {settings.thresholds.green}%, Yellow ≥ {settings.thresholds.yellow}%, Red below {settings.thresholds.yellow}%.
        {from || to ? " Period filter applied: scores use the latest assessment within the selected period." : ""}
      </p>
    </>
  );
}

// Data streams in behind a skeleton so navigation to this page is instant.
export default function PageWithSuspense(props: { searchParams: Promise<{ from?: string; to?: string }> }) {
  return <Suspense fallback={<Loading />}><RankingPage {...props} /></Suspense>;
}
