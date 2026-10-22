"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useStorageValue } from "@/lib/client";
import { Icon } from "@/components/Icon";
import { fmtDate } from "@/lib/format";
import { draftKey } from "./draft";

type C = { id: number; code: string; name: string; location: string; district: string; last_visit: string | null };

export function CentreCards({ userId, centres }: { userId: string; centres: C[] }) {
  const ids = useStorageValue(() => centres.filter(c => localStorage.getItem(draftKey(userId, c.id))).map(c => c.id).join(","));
  const drafts = new Set(ids.split(",").filter(Boolean).map(Number));

  if (!centres.length) return <div className="card"><div className="empty"><b>No centres assigned</b>Please ask the IAQC Coordinator to assign centres to your account.</div></div>;
  return (
    <motion.div className="centre-cards" initial="h" animate="s" variants={{ s: { transition: { staggerChildren: 0.06 } } }}>
      {centres.map(c => {
        const draft = drafts.has(c.id);
        return (
          <motion.div key={c.id} className="card" variants={{ h: { opacity: 0, y: 12 }, s: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } } }}
            whileHover={{ y: -3, boxShadow: "var(--shadow-lg)" }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
            <div className="bd">
              <div className="code">{c.code}</div>
              <h2 style={{ margin: "4px 0 6px" }}>{c.name}</h2>
              <div className="small muted" style={{ marginBottom: 14 }}>{c.location}, {c.district}<br />Last visit {fmtDate(c.last_visit)}</div>
              {draft && <span className="draft">Draft in progress</span>}
              <Link className={`btn ${draft ? "" : "primary"}`} href={`/visits/${c.id}`}>{draft ? "Continue report" : "Start visit report"}<Icon name="right" /></Link>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
