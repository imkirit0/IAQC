"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/lib/data";
import { PRIORITIES } from "@/lib/scoring";
import { saveSettings } from "@/app/actions";
import { useToast } from "@/components/Providers";
import { Reveal } from "@/components/ui";

export function ScoringForm({ st }: { st: Settings }) {
  const router = useRouter(), toast = useToast();
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [green, setGreen] = useState(st.thresholds.green), [yellow, setYellow] = useState(st.thresholds.yellow);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    const r = await saveSettings({ green, yellow, P: Number(v.P), N: Number(v.N), cycle: Number(v.cycle),
      weights: Object.fromEntries(PRIORITIES.map(p => [p, Number(v["w_" + p])])) as Settings["priority_weights"] });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setErr(""); toast("Scoring rules saved. They apply to future assessments."); router.refresh();
  }

  // Live preview of the three bands as the thresholds are edited.
  const valid = 0 < yellow && yellow < green && green <= 100;
  return (
    <Reveal className="card">
      <form onSubmit={submit}>
        <div className="hd"><h2>Thresholds &amp; scoring</h2></div>
        <div className="bd">
          <h3 style={{ marginBottom: 12 }}>Risk indicator thresholds (compliance %)</h3>
          <div className="grid2">
            <label className="f"><span>Green from (minimum score)</span><input type="number" step="0.01" value={green} onChange={e => setGreen(Number(e.target.value))} required /></label>
            <label className="f"><span>Yellow from (minimum score)</span><input type="number" step="0.01" value={yellow} onChange={e => setYellow(Number(e.target.value))} required /></label>
          </div>
          <div className="dist" style={{ height: 8, opacity: valid ? 1 : 0.35, transition: "opacity .2s" }} aria-hidden="true">
            <i style={{ width: `${Math.max(0, yellow)}%`, background: "var(--red-mark)", transition: "width .35s cubic-bezier(.16,1,.3,1)" }} />
            <i style={{ width: `${Math.max(0, green - yellow)}%`, background: "var(--amber-mark)", transition: "width .35s cubic-bezier(.16,1,.3,1)" }} />
            <i style={{ width: `${Math.max(0, 100 - green)}%`, background: "var(--green-mark)", transition: "width .35s cubic-bezier(.16,1,.3,1)" }} />
          </div>
          <p className="small faint" style={{ margin: "8px 0 0" }}>{valid ? `Red below ${yellow}% · Yellow ${yellow}–${green}% · Green ${green}% and above` : "Yellow must be below Green, and Green at most 100."}</p>

          <h3 style={{ margin: "24px 0 12px" }}>Response scoring (% of criterion weight)</h3>
          <div className="grid2">
            <label className="f"><span>Compliant</span><input type="number" value={100} readOnly /></label>
            <label className="f"><span>Partially Compliant</span><input type="number" step="1" min="0" max="100" name="P" defaultValue={st.factors.P} required /></label>
            <label className="f"><span>Non-Compliant</span><input type="number" step="1" min="0" max="100" name="N" defaultValue={st.factors.N} required /></label>
            <label className="f"><span>Not Applicable</span><input value="Excluded from maximum" disabled /></label>
          </div>

          <h3 style={{ margin: "12px 0 12px" }}>Default weight by priority</h3>
          <div className="grid2">{PRIORITIES.map(p => <label key={p} className="f"><span>{p}</span><input type="number" step="0.5" min="0.5" name={`w_${p}`} defaultValue={st.priority_weights[p]} required /></label>)}</div>
          <p className="small faint" style={{ marginTop: -4 }}>Defaults apply when creating criteria or changing priority; existing weights are not changed automatically.</p>
          <label className="f"><span>Visit cycle in days. Centres not visited within it show as pending</span><input type="number" min="1" name="cycle" defaultValue={st.visit_cycle_days} required /></label>
          {err && <div className="err" role="alert">{err}</div>}
          <button className={`btn primary${busy ? " loading" : ""}`} disabled={busy}>Save scoring rules</button>
        </div>
      </form>
    </Reveal>
  );
}
