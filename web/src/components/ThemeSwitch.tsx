"use client";
import { motion } from "motion/react";
import { useEffect, useId, useSyncExternalStore } from "react";
import { Icon } from "./Icon";

const THEMES = [["light", "Light", "sun"], ["dark", "Dark", "moon"], ["system", "Auto", "system"]] as const;
type Pref = (typeof THEMES)[number][0];

function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  const el = document.documentElement;
  el.dataset.themePref = pref;
  el.dataset.theme = dark ? "dark" : "light";
  window.dispatchEvent(new Event("rds-theme"));
}
const subscribe = (cb: () => void) => { window.addEventListener("rds-theme", cb); return () => window.removeEventListener("rds-theme", cb); };

/** Light / Dark / Auto (follows the OS). Choice is remembered on this device. */
export function ThemeSwitch() {
  const pref = useSyncExternalStore(subscribe, () => (document.documentElement.dataset.themePref as Pref) || "system", () => "system" as Pref), id = useId();
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply((document.documentElement.dataset.themePref as Pref) || "system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const choose = (p: Pref) => {
    try { localStorage.setItem("rds-theme", p); } catch { /* storage unavailable */ }
    // Cross-fade the whole page between themes where supported.
    const d = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (d.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) d.startViewTransition(() => apply(p)); else apply(p);
  };
  return (
    <div className="theme" role="group" aria-label="Colour theme">
      {THEMES.map(([k, label, icon]) => (
        <button key={k} type="button" aria-pressed={pref === k} onClick={() => choose(k)} title={`${label} theme`}>
          {pref === k && <motion.span layoutId={`theme-${id}`} className="theme-ind" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <Icon name={icon} /><span>{label}</span>
        </button>
      ))}
    </div>
  );
}
