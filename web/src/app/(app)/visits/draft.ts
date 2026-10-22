// Visit drafts live in this device's browser storage until submitted (per user, per centre).
import type { Responses } from "@/lib/scoring";

export type Draft = { version: number; date: string; responses: Responses; general: string; step: number; changed?: boolean };
export const draftKey = (userId: string, centreId: number) => `rds-draft-${userId}-${centreId}`;

export function loadDraft(key: string): Draft | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}
export function saveDraft(key: string, d: Draft) {
  try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* storage unavailable: the form still works */ }
}
export function dropDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
