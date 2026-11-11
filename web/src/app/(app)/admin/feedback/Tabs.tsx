import Link from "next/link";

const TABS = [["/admin/feedback", "Form"], ["/admin/feedback/responses", "Responses"], ["/admin/feedback/statistics", "Statistics"]];

export const FeedbackTabs = ({ on }: { on: string }) => (
  <nav className="row" aria-label="Student feedback" style={{ gap: 6, marginBottom: 18 }}>
    {TABS.map(([href, label]) => <Link key={href} href={href} className={`btn sm${href === on ? " primary" : ""}`} aria-current={href === on ? "page" : undefined}>{label}</Link>)}
  </nav>
);
