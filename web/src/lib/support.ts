// Support-request workflow: statuses, who may do what from which status, deadline flags. Pure, so the server enforces it
// and the UI shows only what the server would accept. `npm run check` exercises it.

export const DEFAULT_DEPARTMENTS = ["Academics", "PRO / Public Relations", "Marketing", "Materials", "Certification", "Placement", "Operational Support", "Other"];

/** Contact directories: each is maintained by IAQA and by the in-charges of its department. */
export const DIRECTORY = {
  pro: { label: "PROs", dept: "PRO / Public Relations", notes: "Notes" },
  trainer: { label: "Trainers", dept: "Academics", notes: "Courses / subjects" },
  placement: { label: "Placement Officers (GOBS Bank)", dept: "Placement", notes: "Companies / sectors" },
} as const;
export type DirKind = keyof typeof DIRECTORY;

/** An infrastructure specification: both parts are whatever the user types, nothing is predefined. */
export type Spec = { label: string; value: string };
/** Trims specification rows, drops blank ones and caps the list. A row with a value but no label is kept, for the caller to reject. */
export function cleanSpecs(rows: unknown): Spec[] {
  return (Array.isArray(rows) ? rows : []).map(r => ({ label: String(r?.label ?? "").trim().slice(0, 80), value: String(r?.value ?? "").trim().slice(0, 500) }))
    .filter(s => s.label || s.value).slice(0, 50);
}
export const CHECK_OUTCOMES = ["Verified", "Discrepancy"] as const;

// ponytail: Reference Data files pass through a Server Action, so 4 MB is the ceiling (hosting caps request bodies near 4.5 MB);
// switch to signed direct-to-storage uploads if larger files are needed.
export const REF_MAX_BYTES = 4 * 1024 * 1024;
export const REF_FILE_TYPES = ["pdf", "xlsx", "xls", "csv", "docx", "doc", "pptx", "ppt", "txt", "png", "jpg", "jpeg"];
/** Why a Reference Data file cannot be uploaded, or null when it can. */
export function refFileError(name: string, size: number): string | null {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!REF_FILE_TYPES.includes(ext)) return `That file type is not accepted. Use ${REF_FILE_TYPES.join(", ")}.`;
  if (size > REF_MAX_BYTES) return "The file is larger than 4 MB.";
  return size > 0 ? null : "The file is empty.";
}
/** Spreadsheets are read into tables and filtered by ASO; other files stay plain attachments. */
export const isRefSheet = (name: string) => /\.(xlsx|xls|csv)$/i.test(name);
/** How ASO names are matched: spreadsheets, centres and accounts may differ in case and spacing. */
export const asoKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export const CATEGORIES = ["Training", "Academic Support", "PRO Support", "Marketing Support", "Materials Support", "Certification Support", "Operational Support", "Other"];
export const SR_PRIORITIES = ["Normal", "High", "Urgent"] as const;
export const SR_STATUSES = ["Submitted", "Under Review", "Awaiting Clarification", "Assigned", "Accepted", "In Progress", "On Hold",
  "Completed - Awaiting Verification", "Completed", "Rejected", "Cancelled"] as const;
export type SrStatus = (typeof SR_STATUSES)[number];
export type Actor = "requester" | "iaqc" | "dept";

const CLOSED: SrStatus[] = ["Completed", "Rejected", "Cancelled"];
export const isOpen = (s: string) => !CLOSED.includes(s as SrStatus);

type Def = { label: string; by: Actor[]; from: SrStatus[]; to: SrStatus | null; reason?: boolean };
/** to = null: no status change (deadline edit); "complete" and "respond" resolve their target in nextStatus(). */
export const ACTIONS = {
  review: { label: "Start review", by: ["iaqc"], from: ["Submitted"], to: "Under Review" },
  assign: { label: "Assign", by: ["iaqc"], from: ["Submitted", "Under Review"], to: "Assigned" },
  reassign: { label: "Reassign", by: ["iaqc"], from: ["Assigned", "Accepted", "In Progress", "On Hold", "Rejected"], to: "Assigned", reason: true },
  deadlines: { label: "Change deadlines", by: ["iaqc"], from: ["Assigned", "Accepted", "In Progress", "On Hold"], to: null, reason: true },
  clarify: { label: "Ask for clarification", by: ["iaqc", "dept"], from: ["Submitted", "Under Review", "Assigned", "Accepted", "In Progress"], to: "Awaiting Clarification", reason: true },
  respond: { label: "Answer clarification", by: ["requester"], from: ["Awaiting Clarification"], to: null, reason: true },
  accept: { label: "Accept", by: ["dept"], from: ["Assigned"], to: "Accepted" },
  reject: { label: "Reject", by: ["iaqc", "dept"], from: ["Submitted", "Under Review", "Assigned"], to: "Rejected", reason: true },
  progress: { label: "Update progress", by: ["dept"], from: ["Accepted", "In Progress", "On Hold"], to: "In Progress", reason: true },
  hold: { label: "Put on hold", by: ["dept"], from: ["Accepted", "In Progress"], to: "On Hold", reason: true },
  complete: { label: "Record support delivered", by: ["dept"], from: ["Accepted", "In Progress", "On Hold"], to: null },
  verify: { label: "Verify completion", by: ["iaqc"], from: ["Completed - Awaiting Verification"], to: "Completed" },
  return: { label: "Return for further action", by: ["iaqc"], from: ["Completed - Awaiting Verification"], to: "In Progress", reason: true },
  cancel: { label: "Cancel request", by: ["requester", "iaqc"], from: ["Submitted", "Under Review", "Awaiting Clarification", "Assigned"], to: "Cancelled", reason: true },
} satisfies Record<string, Def>;
export type ActionName = keyof typeof ACTIONS;

export const can = (a: ActionName, actors: Actor[], status: string) =>
  (ACTIONS[a].from as string[]).includes(status) && (ACTIONS[a].by as Actor[]).some(x => actors.includes(x));
export const actionsFor = (actors: Actor[], status: string) => (Object.keys(ACTIONS) as ActionName[]).filter(a => can(a, actors, status));

/** Status after an action. Clarification returns to where the request was; completion goes to verification when it is switched on. */
export function nextStatus(a: ActionName, current: string, opts: { resume?: string | null; verification?: boolean } = {}): string {
  if (a === "respond") return opts.resume ?? "Submitted";
  if (a === "complete") return opts.verification ? "Completed - Awaiting Verification" : "Completed";
  return ACTIONS[a].to ?? current;
}

export type Timing = { status: string; response_due: string | null; completion_due: string | null; responded_at: string | null; delivered_at: string | null };
/** Missed deadlines (overdue is a flag next to the status, never a status). A deadline met late still counts as missed. */
export function lateness(r: Timing, now = Date.now()) {
  const t = (s: string | null) => (s ? Date.parse(s) : NaN);
  const open = isOpen(r.status) && r.status !== "Completed - Awaiting Verification";
  const missedResponse = !!r.response_due && (r.responded_at ? t(r.responded_at) > t(r.response_due) : r.status === "Assigned" && now > t(r.response_due));
  const missedCompletion = !!r.completion_due && (r.delivered_at ? t(r.delivered_at) > t(r.completion_due) : open && now > t(r.completion_due));
  const overdue = (r.status === "Assigned" && !r.responded_at && !!r.response_due && now > t(r.response_due)) || (open && !r.delivered_at && !!r.completion_due && now > t(r.completion_due));
  return { missedResponse, missedCompletion, overdue };
}

export const srRef = (id: number) => `SR-${String(id).padStart(5, "0")}`;

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180, R = 6371000;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
