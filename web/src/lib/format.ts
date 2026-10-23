export const pct = (v: number | null | undefined) => (v == null ? "—" : `${(+v).toFixed(2)}%`);
export const fmtDate = (d?: string | null) =>
  d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fmtDT = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const ref = (id: number) => `IAQA-${String(id).padStart(5, "0")}`;
export const initials = (name: string) => name.replace(/\(.*\)/, "").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
export const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

export const CAT_CLASS: Record<string, string> = { Green: "b-green", Yellow: "b-yellow", Red: "b-red" };
export const CAT_LABEL: Record<string, string> = { Green: "Green · Low risk", Yellow: "Yellow · Moderate", Red: "Red · High risk" };
export const catColor = (c: string) => ({ Green: "var(--green-mark)", Yellow: "var(--amber-mark)", Red: "var(--red-mark)" } as Record<string, string>)[c] ?? "var(--grey-mark)";
export const categoryOf = (v: number | null, th: { green: number; yellow: number }) => (v == null ? "Unscorable" : v >= th.green ? "Green" : v >= th.yellow ? "Yellow" : "Red");
