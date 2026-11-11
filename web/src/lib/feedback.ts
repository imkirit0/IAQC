// Student feedback form: question types, cleaning, validation, statistics. Pure, so the browser and the server apply exactly the same rules.
// `npm run check` exercises it.

export const FB_TYPES = {
  short: "Short answer", long: "Paragraph", choice: "Multiple choice", checkbox: "Checkboxes", dropdown: "Dropdown", scale: "Linear scale",
  stars: "Star rating", date: "Date", time: "Time", number: "Number", range: "Range / slider", email: "Email", file: "File upload",
} as const;
export type FbType = keyof typeof FB_TYPES;

/** Every question has every field; each type reads the ones it needs. min/max mean text length, selections allowed or numeric value, by type. from/to bound dates and times. */
export type FbQuestion = {
  id: string; kind: "q"; type: FbType; title: string; help: string; required: boolean; options: string[];
  min: number | null; max: number | null; step: number | null; integer: boolean; minLabel: string; maxLabel: string; from: string; to: string; fileTypes: string[]; maxMb: number;
};
export type FbSection = { id: string; kind: "s"; title: string; help: string };
export type FbItem = FbQuestion | FbSection;
export type FbForm = { title: string; description: string; items: FbItem[] };
export type FbFile = { name: string; size: number; path?: string };
export type FbAnswer = string | number | string[] | FbFile;
export type FbAnswers = Record<string, FbAnswer>;

// ponytail: uploads pass through a Server Action, so one submission's files stay under the 4.5 MB hosting limit; use signed direct-to-storage uploads for larger files.
export const FB_MAX_TOTAL_MB = 4;
const MB = 1024 * 1024;
const TEXT_LIMIT: Partial<Record<FbType, number>> = { short: 1000, long: 10000 };
const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", txt: "text/plain",
  doc: "application/msword", xls: "application/vnd.ms-excel", ppt: "application/vnd.ms-powerpoint",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export const FB_FILE_TYPES = Object.keys(CONTENT_TYPES);
export const fbExt = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");
export const fbContentType = (name: string) => CONTENT_TYPES[fbExt(name)] ?? "application/octet-stream";

export const fbId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const hasOptions = (t: FbType) => t === "choice" || t === "checkbox" || t === "dropdown";

/** A new question of a type, with sensible limits for it. */
export function blankQuestion(type: FbType, id = fbId()): FbQuestion {
  return {
    id, kind: "q", type, title: "", help: "", required: false, options: hasOptions(type) ? ["Option 1"] : [],
    min: type === "scale" ? 1 : type === "stars" ? 1 : type === "range" ? 0 : null, max: type === "scale" || type === "stars" ? 5 : type === "range" ? 100 : null,
    step: type === "range" ? 1 : null, integer: false, minLabel: "", maxLabel: "", from: "", to: "", fileTypes: type === "file" ? ["pdf", "png", "jpg", "jpeg"] : [], maxMb: type === "file" ? FB_MAX_TOTAL_MB : 0,
  };
}

const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Reduces whatever was sent to a well-formed form. It may still be incomplete (a draft can be): formErrors says what publishing needs. */
export function cleanForm(raw: unknown): FbForm {
  const r = (raw ?? {}) as Record<string, unknown>, seen = new Set<string>(), items: FbItem[] = [];
  for (const x of (Array.isArray(r.items) ? r.items : []).slice(0, 500) as Record<string, unknown>[]) {
    const id = typeof x?.id === "string" && /^[a-z0-9]{1,24}$/i.test(x.id) ? x.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (x.kind === "s") { items.push({ id, kind: "s", title: text(x.title, 300), help: text(x.help, 2000) }); continue; }
    if (typeof x.type !== "string" || !(x.type in FB_TYPES)) continue;
    const type = x.type as FbType;
    items.push({
      ...blankQuestion(type, id), title: text(x.title, 1000), help: text(x.help, 2000), required: x.required === true,
      options: hasOptions(type) && Array.isArray(x.options) ? x.options.slice(0, 200).map(o => text(o, 300)) : [],
      min: num(x.min), max: num(x.max), step: num(x.step), integer: x.integer === true, minLabel: text(x.minLabel, 80), maxLabel: text(x.maxLabel, 80),
      from: text(x.from, 10), to: text(x.to, 10),
      fileTypes: type === "file" && Array.isArray(x.fileTypes) ? [...new Set(x.fileTypes.filter((t): t is string => typeof t === "string" && FB_FILE_TYPES.includes(t)))] : [],
      maxMb: type === "file" ? num(x.maxMb) ?? 0 : 0,
    });
  }
  return { title: text(r.title, 200), description: text(r.description, 4000), items };
}

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const whole = (v: number | null) => v != null && Number.isInteger(v);

/** Why this question cannot be published, or null. */
function questionError(q: FbQuestion): string | null {
  if (!q.title) return "needs a question title.";
  const bothOrdered = q.min == null || q.max == null || q.min <= q.max;
  if (hasOptions(q.type)) {
    if (!q.options.length || q.options.some(o => !o)) return "needs at least one option, and no blank options.";
    if (new Set(q.options.map(o => o.toLowerCase())).size < q.options.length) return "has the same option twice.";
  }
  switch (q.type) {
    case "short": case "long":
      if ((q.min != null && (!whole(q.min) || q.min < 0)) || (q.max != null && (!whole(q.max) || q.max < 1 || q.max > TEXT_LIMIT[q.type]!))) return `length limits must be whole numbers, up to ${TEXT_LIMIT[q.type]} characters.`;
      return bothOrdered ? null : "minimum length is above the maximum.";
    case "checkbox":
      if ((q.min != null && (!whole(q.min) || q.min < 0)) || (q.max != null && (!whole(q.max) || q.max < 1))) return "selection limits must be whole numbers.";
      if ((q.min ?? 0) > q.options.length || !bothOrdered) return "selection limits do not fit its options.";
      return null;
    case "scale":
      return whole(q.min) && whole(q.max) && (q.min === 0 || q.min === 1) && q.max! >= 2 && q.max! <= 10 ? null : "scale must start at 0 or 1 and end between 2 and 10.";
    case "stars":
      return whole(q.max) && q.max! >= 3 && q.max! <= 10 ? null : "needs between 3 and 10 stars.";
    case "number":
      return bothOrdered ? null : "minimum is above the maximum.";
    case "range":
      if (q.min == null || q.max == null || q.min >= q.max) return "needs a minimum below its maximum.";
      return q.step != null && q.step > 0 && q.step <= q.max - q.min ? null : "needs a step above zero that fits the range.";
    case "date":
      if ((q.from && !isDate(q.from)) || (q.to && !isDate(q.to))) return "has an invalid date limit.";
      return q.from && q.to && q.from > q.to ? "earliest date is after the latest." : null;
    case "time":
      if ((q.from && !isTime(q.from)) || (q.to && !isTime(q.to))) return "has an invalid time limit.";
      return q.from && q.to && q.from > q.to ? "earliest time is after the latest." : null;
    case "file":
      if (!q.fileTypes.length) return "needs at least one allowed file type.";
      return q.maxMb > 0 && q.maxMb <= FB_MAX_TOTAL_MB ? null : `maximum file size must be above 0 and at most ${FB_MAX_TOTAL_MB} MB.`;
    default: return null;
  }
}

/** Everything stopping this form being published to students. */
export function formErrors(form: FbForm): string[] {
  const errs: string[] = [];
  if (!form.title) errs.push("The form needs a title.");
  let n = 0;
  form.items.forEach((it, i) => {
    if (it.kind === "s") { if (!it.title) errs.push(`Section at position ${i + 1} needs a heading.`); return; }
    n++;
    const e = questionError(it);
    if (e) errs.push(`Question ${n} ${e}`);
  });
  if (!n) errs.push("Add at least one question.");
  return errs;
}

/** Why this file is not acceptable for the question, or null. Size and extension only: the server also checks the content (fileContentMatches). */
export function fileError(q: FbQuestion, name: string, size: number): string | null {
  if (!q.fileTypes.includes(fbExt(name))) return `Only these file types are accepted: ${q.fileTypes.join(", ")}.`;
  if (size <= 0) return "This file is empty.";
  return size > q.maxMb * MB ? `The file must be ${q.maxMb} MB or smaller.` : null;
}

/** Whether the bytes are really the type the extension claims, so a renamed executable or web page is refused. */
export function fileContentMatches(name: string, b: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v), ole = () => starts(0xd0, 0xcf, 0x11, 0xe0), zip = () => starts(0x50, 0x4b, 0x03, 0x04);
  switch (fbExt(name)) {
    case "pdf": return starts(0x25, 0x50, 0x44, 0x46);
    case "png": return starts(0x89, 0x50, 0x4e, 0x47);
    case "jpg": case "jpeg": return starts(0xff, 0xd8, 0xff);
    case "webp": return starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    case "doc": case "xls": case "ppt": return ole();
    case "docx": case "xlsx": case "pptx": return zip();
    case "txt": return !b.slice(0, 8192).includes(0);
    default: return false;
  }
}

/** Checks a submission against its form and returns the clean answers, in the stored shape. Only the form's own questions are read, so extra fields are ignored.
 *  A file question's raw value is { name, size }. */
export function validateAnswers(form: FbForm, raw: Record<string, unknown>): { errors: Record<string, string>; answers: FbAnswers } {
  const errors: Record<string, string> = {}, answers: FbAnswers = {};
  for (const q of form.items) {
    if (q.kind !== "q") continue;
    const v = raw[q.id];
    const fail = (m: string) => { errors[q.id] = m; };
    if (q.type === "checkbox") {
      const picked = Array.isArray(v) ? [...new Set(v.filter((o): o is string => typeof o === "string"))] : [];
      if (!picked.length) { if (q.required) fail("Please select at least one option."); continue; }
      if (picked.some(o => !q.options.includes(o))) fail("Please choose from the options shown.");
      else if (q.min != null && picked.length < q.min) fail(`Please select at least ${q.min}.`);
      else if (q.max != null && picked.length > q.max) fail(`Please select no more than ${q.max}.`);
      else answers[q.id] = q.options.filter(o => picked.includes(o));
      continue;
    }
    if (q.type === "file") {
      const f = v as FbFile | undefined;
      if (!f || typeof f.name !== "string" || typeof f.size !== "number") { if (q.required) fail("Please attach a file."); continue; }
      const e = fileError(q, f.name, f.size);
      if (e) fail(e); else answers[q.id] = { name: f.name.trim().slice(0, 200), size: f.size };
      continue;
    }
    const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
    if (!s) { if (q.required) fail("This question is required."); continue; }
    switch (q.type) {
      case "short": case "long": {
        const max = Math.min(q.max ?? Infinity, TEXT_LIMIT[q.type]!);
        if (q.min != null && s.length < q.min) fail(`Please enter at least ${q.min} characters.`);
        else if (s.length > max) fail(`Please enter no more than ${max} characters.`);
        else answers[q.id] = s;
        break;
      }
      case "choice": case "dropdown":
        if (q.options.includes(s)) answers[q.id] = s; else fail("Please choose from the options shown.");
        break;
      case "scale": case "stars": {
        const n = Number(s), lo = q.type === "stars" ? 1 : q.min!;
        if (Number.isInteger(n) && n >= lo && n <= q.max!) answers[q.id] = n; else fail("Please choose a rating.");
        break;
      }
      case "number": case "range": {
        const n = /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
        if (Number.isNaN(n)) fail("Please enter a number.");
        else if (q.type === "number" && q.integer && !Number.isInteger(n)) fail("Please enter a whole number.");
        else if (q.min != null && n < q.min) fail(`Please enter ${q.min} or more.`);
        else if (q.max != null && n > q.max) fail(`Please enter ${q.max} or less.`);
        else if (q.type === "range" && Math.abs((n - q.min!) / q.step! - Math.round((n - q.min!) / q.step!)) > 1e-9) fail("Please choose a value on the slider.");
        else answers[q.id] = n;
        break;
      }
      case "date":
        if (!isDate(s)) fail("Please enter a valid date.");
        else if (q.from && s < q.from) fail(`Please choose ${q.from} or later.`);
        else if (q.to && s > q.to) fail(`Please choose ${q.to} or earlier.`);
        else answers[q.id] = s;
        break;
      case "time":
        if (!isTime(s)) fail("Please enter a valid time.");
        else if (q.from && s < q.from) fail(`Please choose ${q.from} or later.`);
        else if (q.to && s > q.to) fail(`Please choose ${q.to} or earlier.`);
        else answers[q.id] = s;
        break;
      case "email":
        if (s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) answers[q.id] = s; else fail("Please enter a valid email address.");
        break;
    }
  }
  return { errors, answers };
}

/** An answer as plain text. */
export function answerText(a: FbAnswer | undefined): string {
  if (a == null) return "";
  if (Array.isArray(a)) return a.join("; ");
  return typeof a === "object" ? a.name : String(a);
}
export const fbSearchText = (answers: FbAnswers) => Object.values(answers).map(answerText).join(" ").slice(0, 20000);

export type FbRow = { id: number; version: number; answers: FbAnswers; submitted_at: string; status: string; verified_at: string | null };

/** Every question ever published, newest wording first: a question edited between versions counts once, under its latest title. */
function allQuestions(versions: Map<number, FbForm>) {
  const seen = new Map<string, FbQuestion>();
  [...versions.keys()].sort((a, b) => b - a).forEach(v => versions.get(v)!.items.forEach(q => { if (q.kind === "q" && !seen.has(q.id)) seen.set(q.id, q); }));
  return [...seen.values()];
}

export type FbStat = { id: string; title: string; type: FbType; answered: number; counts: [string, number][]; avg: number | null; min: number | null; max: number | null };

/** Per-question summaries. Choices and ratings are counted by value; numbers get average, lowest and highest; other answers are counted only. */
export function feedbackStats(versions: Map<number, FbForm>, rows: FbRow[]): FbStat[] {
  return allQuestions(versions).map(q => {
    const given = rows.map(r => r.answers[q.id]).filter(a => a != null);
    const numbers = given.filter((a): a is number => typeof a === "number");
    const counts = new Map<string, number>();
    if (hasOptions(q.type)) q.options.forEach(o => counts.set(o, 0));
    if (q.type === "scale" || q.type === "stars") for (let i = q.type === "stars" ? 1 : q.min!; i <= q.max!; i++) counts.set(String(i), 0);
    if (hasOptions(q.type) || q.type === "scale" || q.type === "stars") given.flat().forEach(a => counts.set(String(a), (counts.get(String(a)) ?? 0) + 1)); // answers to options since removed still count
    return {
      id: q.id, title: q.title, type: q.type, answered: given.length, counts: [...counts],
      avg: numbers.length ? Math.round((numbers.reduce((a, b) => a + b, 0) / numbers.length) * 100) / 100 : null,
      min: numbers.length ? Math.min(...numbers) : null, max: numbers.length ? Math.max(...numbers) : null,
    };
  });
}

/** Responses as a grid for Excel and CSV: one column per question ever published. */
export function exportGrid(versions: Map<number, FbForm>, rows: FbRow[], fmt: (at: string | null) => string): (string | number)[][] {
  const qs = allQuestions(versions);
  return [
    ["Response", "Submitted", "Status", "Verified", "Form version", ...qs.map(q => q.title)],
    ...rows.map(r => [r.id, fmt(r.submitted_at), r.status, fmt(r.verified_at), r.version, ...qs.map(q => { const a = r.answers[q.id]; return typeof a === "number" ? a : answerText(a); })]),
  ];
}
