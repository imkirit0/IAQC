"use client";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

/**
 * Form dialog. onSubmit returns an error message (shown inline) or nothing on success.
 * Escape closes; focus moves into the dialog and returns to the opener afterwards.
 */
export function Modal({ open, title, onClose, onSubmit, submitLabel = "Save", children, wide }: {
  open: boolean; title: string; onClose: () => void; onSubmit?: (form: HTMLFormElement) => Promise<string | void>;
  submitLabel?: string; children: ReactNode; wide?: boolean;
}) {
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const close = () => { setErr(""); onClose(); };
  const formRef = useRef<HTMLFormElement>(null), opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const t = setTimeout(() => formRef.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea")?.focus(), 60);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setErr(""); onClose(); } };
    document.addEventListener("keydown", key);
    return () => { clearTimeout(t); document.removeEventListener("keydown", key); (opener.current as HTMLElement | null)?.focus?.(); };
  }, [open, onClose]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!onSubmit) return;
    setBusy(true);
    const msg = await onSubmit(e.currentTarget).catch(x => (x as Error).message);
    setBusy(false);
    if (msg) setErr(msg); else close();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && close()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <motion.form ref={formRef} className="modal" style={wide ? { maxWidth: 760 } : undefined} role="dialog" aria-modal="true" aria-label={title} onSubmit={submit} noValidate={false}
            initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}>
            <div className="hd"><h2>{title}</h2><span className="spacer" /><button type="button" className="btn sm quiet" onClick={close} aria-label="Close"><Icon name="close" /></button></div>
            <div className="bd">{children}
              <AnimatePresence>{err && <motion.div className="err" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{err}</motion.div>}</AnimatePresence>
            </div>
            <div className="ft"><button type="button" className="btn" onClick={close}>Cancel</button>
              {onSubmit && <button className={`btn primary${busy ? " loading" : ""}`} disabled={busy}>{submitLabel}</button>}</div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export const formData = (f: HTMLFormElement) => Object.fromEntries(new FormData(f)) as Record<string, string>;
