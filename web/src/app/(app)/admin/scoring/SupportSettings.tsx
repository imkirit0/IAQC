"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Settings } from "@/lib/data";
import { saveSupportSettings } from "@/app/actions";
import { formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { Reveal } from "@/components/ui";

export function SupportSettings({ st }: { st: Settings }) {
  const router = useRouter(), toast = useToast();
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = formData(e.currentTarget);
    setBusy(true);
    const r = await saveSupportSettings({ departments: v.departments.split("\n"), verification: v.verification === "on", gps_required: v.gps_required === "on", gps_flag_m: Number(v.gps_flag_m) });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setErr(""); toast("Support and location settings saved"); router.refresh();
  }

  return (
    <Reveal delay={0.15} className="card mt">
      <form onSubmit={submit}>
        <div className="hd"><h2>Support requests &amp; visit location</h2></div>
        <div className="bd">
          <label className="f"><span>Departments, one per line</span><textarea name="departments" rows={7} defaultValue={st.departments.join("\n")} required /></label>
          <p className="small faint" style={{ marginTop: -6 }}>Removing a department keeps its existing requests and accounts; it can no longer be chosen for new ones.</p>
          <label className="check"><input type="checkbox" name="verification" defaultChecked={st.support_verification} /> IAQA verifies completed support before a request is closed</label>
          <label className="check"><input type="checkbox" name="gps_required" defaultChecked={st.gps_required} /> Require the coordinator&apos;s location to submit a visit report (otherwise they may submit it marked unverified, with a reason)</label>
          <label className="f mt"><span>Flag visits submitted more than this many metres from the registered centre location</span><input type="number" name="gps_flag_m" min={10} max={100000} defaultValue={st.gps_flag_m} required /></label>
          {err && <div className="err" role="alert">{err}</div>}
          <button className={`btn primary${busy ? " loading" : ""}`} disabled={busy}>Save settings</button>
        </div>
      </form>
    </Reveal>
  );
}
