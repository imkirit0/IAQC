"use client";
import { Modal, formData } from "./Modal";
import { useToast } from "./Providers";
import { changePassword } from "@/app/actions";

export function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal open={open} title="Change password" onClose={onClose} submitLabel="Change password" onSubmit={async f => {
      const v = formData(f);
      const r = await changePassword(v.current, v.next);
      if (r.error) return r.error;
      toast("Password changed");
    }}>
      <label className="f"><span>Current password</span><input type="password" name="current" required autoComplete="current-password" /></label>
      <label className="f"><span>New password (at least 8 characters)</span><input type="password" name="next" minLength={8} required autoComplete="new-password" /></label>
    </Modal>
  );
}
