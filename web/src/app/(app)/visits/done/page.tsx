"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useStorageValue } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { fmtDate, fmtDT } from "@/lib/format";

type Last = { reference?: string; centre?: string; date?: string; submitted_at?: string };

export default function Done() {
  const raw = useStorageValue(() => sessionStorage.getItem("rds-last") ?? "");
  let r: Last = {};
  try { r = JSON.parse(raw || "{}"); } catch { /* ignore */ }
  return (
    <div className="ac-wrap" style={{ maxWidth: 560 }}>
      <div className="card"><div className="bd center" style={{ padding: "44px 28px" }}>
        <motion.div className="done-mark" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
          <svg className="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.5, ease: "easeOut" }} />
          </svg>
        </motion.div>
        <h1>Report submitted</h1>
        <p className="muted" style={{ margin: "10px auto 0", maxWidth: "40ch" }}>Your centre visit report has been recorded and sent to the IAQA Coordinator for review.</p>
        <dl className="info-list" style={{ maxWidth: 340, margin: "26px auto", textAlign: "left", padding: "16px 0", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
          <dt>Reference</dt><dd>{r.reference ?? "—"}</dd><dt>Centre</dt><dd>{r.centre ?? "—"}</dd>
          <dt>Visit date</dt><dd>{fmtDate(r.date)}</dd><dt>Submitted</dt><dd>{fmtDT(r.submitted_at)}</dd>
        </dl>
        <Link className="btn primary" href="/visits"><Icon name="left" />Back to my centres</Link>
      </div></div>
    </div>
  );
}
