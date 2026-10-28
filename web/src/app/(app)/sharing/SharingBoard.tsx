"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Share } from "@/lib/data";
import { acceptShare, deleteShare, sendShare } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { Modal, formData } from "@/components/Modal";
import { useToast } from "@/components/Providers";
import { PageHead } from "@/components/ui";
import { fmtDT, TZ } from "@/lib/format";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

/** PROs and Area Coordinators send and accept; everyone else reads the same history. */
export function SharingBoard({ items, recipients, meId, sender, to, canDelete }: {
  items: Share[]; recipients: { id: string; name: string }[]; meId: string; sender: boolean; to: string; canDelete: boolean;
}) {
  const router = useRouter(), toast = useToast();
  const [view, setView] = useState<"all" | "in" | "out">("all"), [q, setQ] = useState(""), [from, setFrom] = useState(""), [until, setUntil] = useState("");
  const [who, setWho] = useState(""), [whom, setWhom] = useState(""), [status, setStatus] = useState("");
  const [composing, setComposing] = useState(false), [accepting, setAccepting] = useState<Share | null>(null);
  const an = to === "Area Coordinator" ? "an" : "a";
  const waiting = items.filter(i => i.recipient_id === meId && !i.accepted_at).length;
  const s = q.trim().toLowerCase();
  const rows = items.filter(i => (view === "all" || (view === "in" ? i.recipient_id === meId : i.sender_id === meId))
    && (!s || `${i.subject} ${i.remarks} ${i.reply}`.toLowerCase().includes(s)) && (!from || day(i.sent_at) >= from) && (!until || day(i.sent_at) <= until)
    && (!who || i.from === who) && (!whom || i.to === whom) && (!status || (status === "Accepted") === !!i.accepted_at));
  const names = (k: "from" | "to") => [...new Set(items.map(i => i[k]))].sort();

  async function remove(i: Share) {
    if (!window.confirm(`Delete "${i.subject}" from the sharing history? This cannot be undone.`)) return;
    const r = await deleteShare(i.id);
    if (r.error) return toast(r.error, true);
    toast("Item deleted"); router.refresh();
  }

  return (
    <>
      <PageHead title="Information sharing" sub={sender ? `Share information with ${an} ${to} of your district and accept what is sent to you. Everyone can read this history; items cannot be changed once sent.`
        : "Information shared between PROs and Area Coordinators, and when it was accepted. Read-only."}>
        {sender && <button className="btn primary" onClick={() => setComposing(true)}><Icon name="plus" />Share with {an} {to}</button>}
      </PageHead>
      {waiting > 0 && <div className="banner warn"><Icon name="info" /><div><b>{waiting} item{waiting === 1 ? " is" : "s are"} waiting for your acceptance.</b> Accept each one once you have read it.</div></div>}

      <div className="card">
        <div className="filters">
          {sender && <div className="seg" role="group" aria-label="Show">
            {([["all", "All"], ["in", "Sent to me"], ["out", "Sent by me"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
          </div>}
          <div className="search"><Icon name="search" /><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search subject or remarks" aria-label="Search" /></div>
          <select value={who} onChange={e => setWho(e.target.value)} aria-label="Sender"><option value="">Any sender</option>{names("from").map(n => <option key={n}>{n}</option>)}</select>
          <select value={whom} onChange={e => setWhom(e.target.value)} aria-label="Recipient"><option value="">Any recipient</option>{names("to").map(n => <option key={n}>{n}</option>)}</select>
          <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">Any status</option><option>Sent</option><option>Accepted</option></select>
          <label className="small row" style={{ gap: 6 }}>From <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="small row" style={{ gap: 6 }}>To <input type="date" value={until} onChange={e => setUntil(e.target.value)} /></label>
          <span className="spacer" /><span className="small faint">{rows.length} shown</span>
        </div>
        <div className="tw"><table>
          <thead><tr><th>Subject</th><th>Remarks</th><th>From / To</th><th>Sent on</th><th>Status</th><th>Accepted by / on</th><th /></tr></thead>
          <tbody>{rows.map(i => (
            <tr key={i.id}>
              <td data-l="Subject"><b>{i.subject}</b></td>
              <td data-l="Remarks" className="small" style={{ whiteSpace: "pre-wrap" }}>{i.remarks}{i.reply && <div className="muted" style={{ marginTop: 6 }}><b>Reply:</b> {i.reply}</div>}</td>
              <td data-l="From / To" className="small">{i.from} <span className="faint">({i.from_role})</span><br /><Icon name="right" size={12} /> {i.to} <span className="faint">({i.to_role})</span></td>
              <td data-l="Sent on" className="small nowrap">{fmtDT(i.sent_at)}</td>
              <td data-l="Status">{i.accepted_at ? <span className="badge b-green">Accepted</span> : <span className="badge b-yellow">Sent</span>}</td>
              <td data-l="Accepted by / on" className="small">{i.accepted_at ? <>{i.to}<br /><span className="faint">{fmtDT(i.accepted_at)}</span></> : <span className="faint">—</span>}</td>
              <td data-l="" className="nowrap right">
                {i.recipient_id === meId && !i.accepted_at && <button className="btn sm primary" onClick={() => setAccepting(i)}>Accept</button>}
                {canDelete && <button className="btn sm quiet" onClick={() => remove(i)}>Delete</button>}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td data-l="" colSpan={7} className="empty"><b>Nothing to show</b>{items.length ? "Adjust the filters." : "No information has been shared yet."}</td></tr>}</tbody>
        </table></div>
      </div>

      <Modal open={composing} onClose={() => setComposing(false)} title={`Share with ${an} ${to}`} submitLabel="Send" onSubmit={async f => {
        const v = formData(f);
        const r = await sendShare({ recipient_id: v.recipient_id, subject: v.subject, remarks: v.remarks });
        if (r.error) return r.error;
        toast("Sent"); router.refresh();
      }}>
        <label className="f"><span>To</span><select name="recipient_id" required defaultValue=""><option value="" disabled>Choose {an} {to}</option>{recipients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {!recipients.length && <p className="small late">There is no active {to} in your district yet.</p>}
        <label className="f"><span>Subject</span><input name="subject" required maxLength={150} /></label>
        <label className="f"><span>Remarks</span><textarea name="remarks" required /></label>
        <p className="small faint">Once sent, the item cannot be edited or deleted, and every user can read it.</p>
      </Modal>

      <Modal open={!!accepting} onClose={() => setAccepting(null)} title={`Accept: ${accepting?.subject ?? ""}`} submitLabel="Accept" onSubmit={async f => {
        const r = await acceptShare(accepting!.id, formData(f).reply);
        if (r.error) return r.error;
        toast("Accepted"); router.refresh();
      }}>
        <p className="small muted" style={{ whiteSpace: "pre-wrap" }}>{accepting?.remarks}</p>
        <label className="f"><span>Reply (optional)</span><textarea name="reply" /></label>
      </Modal>
    </>
  );
}
