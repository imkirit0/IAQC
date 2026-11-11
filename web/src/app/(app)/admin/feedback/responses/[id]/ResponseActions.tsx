"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { feedbackFileUrl, verifyFeedback } from "@/app/actions";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/Providers";

export function VerifyButton({ id }: { id: number }) {
  const router = useRouter(), toast = useToast(), [busy, setBusy] = useState(false);
  async function verify() {
    if (!window.confirm("Mark this response as Verified? This cannot be undone.")) return;
    setBusy(true);
    const r = await verifyFeedback(id);
    setBusy(false);
    if (r.error) return toast(r.error, true);
    toast("Response verified"); router.refresh();
  }
  return <button type="button" className={`btn primary${busy ? " loading" : ""}`} disabled={busy} onClick={verify}><Icon name="tick" />Mark as Verified</button>;
}

export function FileButton({ id, questionId, name }: { id: number; questionId: string; name: string }) {
  const toast = useToast();
  async function open() {
    const r = await feedbackFileUrl(id, questionId);
    if (r.error) return toast(r.error, true);
    window.location.assign(r.data!.url as string); // a download link: the page stays where it is
  }
  return <button type="button" className="btn sm" onClick={open}><Icon name="down" />{name}</button>;
}
