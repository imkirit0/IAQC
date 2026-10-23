"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { ThemeSwitch } from "./ThemeSwitch";
import { ChangePassword } from "./ChangePassword";
import { logout } from "@/app/actions";
import { initials } from "@/lib/format";

type Role = "ac" | "iaqc" | "cmd";
const NAV: Record<Role, [string, string, IconName][]> = {
  iaqc: [["/ranking", "Risk ranking", "dash"], ["/assessments", "Assessments", "list"], ["/admin/centres", "Centres", "centre"], ["/admin/users", "Users", "users"],
         ["/admin/checklist", "Checklist", "check"], ["/admin/scoring", "Scoring", "sliders"], ["/admin/audit", "Audit log", "log"]],
  cmd: [["/overview", "Overview", "dash"], ["/ranking", "Centre ranking", "rank"], ["/assessments", "History", "list"]],
  ac: [["/visits", "My centres", "centre"]],
};
const ROLE_LABEL: Record<Role, string> = { ac: "Area Coordinator", iaqc: "IAQA Coordinator", cmd: "CMD, Super Admin" };

export function Masthead({ me }: { me: { name: string; username: string; role: Role } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false), [pw, setPw] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Scorecards belong to the ranking tab.
  const active = (href: string) => path === href || path.startsWith(href + "/") || (path.startsWith("/scorecard") && href === "/ranking");

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <header className="mast">
      <div className="mast-in">
        <Link className="brand" href="/" aria-label="IAQA home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/gtec-logo.png" alt="G-TEC Education" width={50} height={34} />
          <b>IAQA</b><small>Internal Audit<br />&amp; Quality Assurance</small>
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV[me.role].map(([href, label, icon]) => (
            <Link key={href} href={href} className={active(href) ? "on" : ""} aria-current={active(href) ? "page" : undefined}>
              <Icon name={icon} />{label}
              {active(href) && <motion.span layoutId="nav-ind" className="nav-ind" transition={{ type: "spring", stiffness: 480, damping: 40 }} />}
            </Link>
          ))}
        </nav>
        <div className="mast-end">
          {me.role === "cmd" && <span className="stamp ro">Read-only</span>}
          <span className="stamp" title="Centres are real; sign-in accounts and checklist criteria are samples for evaluation">Evaluation</span>
          <div className={`user${open ? " open" : ""}`} ref={box}>
            <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
              <span className="avatar">{initials(me.name)}</span>
              <span className="who"><b>{me.name}</b><span>{ROLE_LABEL[me.role]}</span></span>
              <motion.span animate={{ rotate: open ? 180 : 0 }} style={{ display: "inline-flex", color: "var(--ink-3)" }}><Icon name="chevron" size={14} /></motion.span>
            </button>
            <AnimatePresence>
              {open && (
                <motion.div className="menu" role="menu" style={{ display: "block", transformOrigin: "top right" }}
                  initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}>
                  <div className="head"><b>{me.name}</b><span>{ROLE_LABEL[me.role]} · {me.username}</span></div>
                  <button className="item" role="menuitem" onClick={() => { setOpen(false); setPw(true); }}><Icon name="key" />Change password</button>
                  <form action={logout}><button className="item" role="menuitem"><Icon name="logout" />Sign out</button></form>
                  <div className="lbl">Appearance</div>
                  <ThemeSwitch />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <ChangePassword open={pw} onClose={() => setPw(false)} />
    </header>
  );
}
