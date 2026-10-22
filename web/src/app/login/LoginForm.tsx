"use client";
import { useActionState, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { login } from "../actions";
import { initials } from "@/lib/format";

// Demo credentials come from the seed data (DEMO DATA only).
const DEMO = [
  ["iaqc", "Iaqc@Demo2026", "IAQC Coordinator", "Administrator"], ["cmd", "Cmd@Demo2026", "CMD", "Super Admin, read-only"],
  ["arjun.ac", "Arjun@Demo2026", "Arjun Menon", "Area Coordinator"], ["priya.ac", "Priya@Demo2026", "Priya Nair", "Area Coordinator"],
  ["rahul.ac", "Rahul@Demo2026", "Rahul Das", "Area Coordinator"],
];

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  const form = useRef<HTMLFormElement>(null);
  const fill = (u: string, p: string) => {
    const f = form.current!;
    (f.elements.namedItem("username") as HTMLInputElement).value = u;
    (f.elements.namedItem("password") as HTMLInputElement).value = p;
    f.querySelector<HTMLButtonElement>("button.primary")?.focus();
  };
  return (
    <motion.form ref={form} action={action} className="box" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
      <h2>Sign in</h2>
      <p className="muted" style={{ margin: "0 0 24px" }}>Use the account issued by your IAQC Coordinator.</p>
      <label className="f"><span>Username</span><input name="username" autoComplete="username" required autoCapitalize="none" spellCheck={false} /></label>
      <label className="f"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
      <AnimatePresence>{state?.error && <motion.div className="err" role="alert" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [6, -4, 2, 0] }} exit={{ opacity: 0 }}>{state.error}</motion.div>}</AnimatePresence>
      <button className={`btn primary lg${pending ? " loading" : ""}`} disabled={pending}>Sign in</button>
      <div className="demo-acc">
        <div className="h">Demo accounts · select to fill</div>
        {DEMO.map(([u, p, name, role]) => (
          <button type="button" key={u} onClick={() => fill(u, p)}><span className="avatar">{initials(name)}</span><span className="who"><b>{name}</b><span>{role}</span></span><code>{u}</code></button>
        ))}
      </div>
    </motion.form>
  );
}
