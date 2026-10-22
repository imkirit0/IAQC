// Scoring engine: pure functions, shared by server code and the self-check script.
export type Status = "C" | "P" | "N" | "NA";
export type Priority = "Critical" | "High" | "Medium" | "Low";
export type Category = "Green" | "Yellow" | "Red" | "Unscorable" | "Incomplete" | "Not Assessed";

export const STATUSES: Status[] = ["C", "P", "N", "NA"];
export const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];
export const STATUS_LABEL: Record<Status, string> = { C: "Compliant", P: "Partially Compliant", N: "Non-Compliant", NA: "Not Applicable" };

export type Thresholds = { green: number; yellow: number };
export type Factors = { C: number; P: number; N: number };
export type SnapCriterion = { id: number; text: string; description: string; priority: Priority; weight: number; critical: boolean; mandatory: boolean };
export type Snapshot = { version: number; rules: { factors: Factors; thresholds: Thresholds }; sections: { id: number; name: string; criteria: SnapCriterion[] }[] };
export type Responses = Record<string, { status?: string; remark?: string }>;

export type Item = SnapCriterion & { section: string; status: Status | null; points: number | null; remark: string; alert: boolean };
export type SectionScore = { id: number; name: string; earned: number; max: number; score: number | null; category: Category; violations: number };
export type Alert = { criterion_id: number; text: string; section: string; remark: string };
export type Result = {
  score: number | null; risk: number | null; category: Category; status: "Scored" | "Unscorable" | "Incomplete";
  earned: number; max: number; counts: Record<Status | "unanswered", number>; assessed: number;
  sections: SectionScore[]; items: Item[]; alerts: Alert[]; thresholds: Thresholds; factors: Factors;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function category(score: number | null, th: Thresholds): Category {
  if (score == null) return "Unscorable";
  return score >= th.green ? "Green" : score >= th.yellow ? "Yellow" : "Red";
}

export const needsRemark = (c: { critical: boolean; priority: Priority }, st?: string | null) =>
  st === "N" || (st === "P" && (c.critical || c.priority === "Critical" || c.priority === "High"));

/** Snapshot (checklist + rules at submission time) + responses -> full, traceable score. */
export function compute(snap: Snapshot, responses: Responses): Result {
  const { factors: f, thresholds: th } = snap.rules;
  const counts = { C: 0, P: 0, N: 0, NA: 0, unanswered: 0 };
  const sections: SectionScore[] = [], items: Item[] = [], alerts: Alert[] = [];
  let te = 0, tm = 0;
  for (const s of snap.sections) {
    let se = 0, sm = 0, viol = 0;
    for (const c of s.criteria) {
      const r = responses[String(c.id)] ?? {};
      let st = (STATUSES as string[]).includes(r.status ?? "") ? (r.status as Status) : null;
      let pts: number | null = null;
      if (!st) { counts.unanswered++; st = null; }
      else {
        counts[st]++;
        if (st !== "NA") {
          pts = (c.weight * f[st]) / 100;
          se += pts; sm += c.weight;
          if (st === "N" || st === "P") viol++;
        }
      }
      const alert = Boolean(c.critical && st === "N");
      if (alert) alerts.push({ criterion_id: c.id, text: c.text, section: s.name, remark: r.remark ?? "" });
      items.push({ ...c, section: s.name, status: st, points: pts, remark: r.remark ?? "", alert });
    }
    const sc = sm ? r2((se / sm) * 100) : null;
    sections.push({ id: s.id, name: s.name, earned: r2(se), max: sm, score: sc, category: category(sc, th), violations: viol });
    te += se; tm += sm;
  }
  const complete = counts.unanswered === 0;
  const score = tm && complete ? r2((te / tm) * 100) : null;
  return {
    score, risk: score == null ? null : r2(100 - score),
    category: complete ? category(score, th) : "Incomplete",
    status: !complete ? "Incomplete" : !tm ? "Unscorable" : "Scored",
    earned: r2(te), max: tm, counts, assessed: counts.C + counts.P + counts.N,
    sections, items, alerts, thresholds: th, factors: f,
  };
}

export function validateResponses(snap: Snapshot, resp: Responses): string[] {
  const errors: string[] = [];
  for (const s of snap.sections) for (const c of s.criteria) {
    const r = resp[String(c.id)] ?? {};
    const st = r.status, rem = (r.remark ?? "").trim();
    if (!(STATUSES as string[]).includes(st ?? "")) errors.push(`Not answered: ${c.text}`);
    else if (st === "NA" && c.mandatory) errors.push(`Mandatory criterion cannot be Not Applicable: ${c.text}`);
    else if (needsRemark(c, st) && !rem) errors.push(`Remark required: ${c.text}`);
  }
  return errors;
}
