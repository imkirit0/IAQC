// Offline self-check of the scoring engine safeguards. Run: npm run check
import assert from "node:assert/strict";
import { compute, validateResponses, type Snapshot } from "../src/lib/scoring";

const snap: Snapshot = {
  version: 1,
  rules: { factors: { C: 100, P: 50, N: 0 }, thresholds: { green: 85, yellow: 70 } },
  sections: [{ id: 1, name: "S", criteria: [
    { id: 1, text: "a", description: "", priority: "Critical", weight: 10, critical: true, mandatory: true },
    { id: 2, text: "b", description: "", priority: "Low", weight: 1, critical: false, mandatory: false },
  ] }],
};

let r = compute(snap, { 1: { status: "C" }, 2: { status: "P" } });
assert.equal(r.score, Math.round((10.5 / 11) * 10000) / 100);
assert.equal(r.category, "Green");
assert.equal(compute(snap, { 1: { status: "NA" }, 2: { status: "NA" } }).status, "Unscorable");
assert.equal(compute(snap, { 1: { status: "C" } }).score, null, "unanswered must never count as compliant");
r = compute(snap, { 1: { status: "N", remark: "x" }, 2: { status: "NA" } });
assert.equal(r.score, 0);
assert.equal(r.alerts.length, 1, "critical non-compliance raises an alert");
assert.match(validateResponses(snap, { 1: { status: "N" }, 2: { status: "C" } })[0], /Remark required/);
assert.match(validateResponses(snap, { 1: { status: "NA" }, 2: { status: "C" } })[0], /Mandatory/);
assert.equal(validateResponses(snap, { 1: { status: "C" }, 2: { status: "P" } }).length, 0);
console.log("Scoring checks passed.");

// Support-request workflow: role-gated transitions and deadline flags.
import { actionsFor, can, distanceM, lateness, nextStatus } from "../src/lib/support";
assert(can("assign", ["iaqc"], "Submitted") && !can("assign", ["dept"], "Submitted"), "only IAQA assigns");
assert(!can("accept", ["requester"], "Assigned") && can("accept", ["dept"], "Assigned"), "only the department accepts");
assert(!can("verify", ["dept"], "Completed - Awaiting Verification"), "a department cannot verify its own work");
assert(!can("cancel", ["requester"], "In Progress"), "accepted work cannot be cancelled by the requester");
assert.deepEqual(actionsFor([], "Assigned"), [], "monitoring (CMD) has no actions");
assert.deepEqual(actionsFor(["dept"], "Completed"), [], "closed requests are final");
assert.equal(nextStatus("respond", "Awaiting Clarification", { resume: "Accepted" }), "Accepted");
assert.equal(nextStatus("complete", "In Progress", { verification: true }), "Completed - Awaiting Verification");
assert.equal(nextStatus("complete", "In Progress", { verification: false }), "Completed");
const now = Date.parse("2026-10-26T12:00:00Z"), base = { responded_at: null, delivered_at: null, completion_due: null };
assert(lateness({ ...base, status: "Assigned", response_due: "2026-10-26T10:00:00Z" }, now).overdue, "unanswered past the response deadline is overdue");
assert(!lateness({ ...base, status: "Assigned", response_due: "2026-10-27T10:00:00Z" }, now).overdue);
const late = lateness({ status: "In Progress", response_due: "2026-10-25T10:00:00Z", responded_at: "2026-10-25T11:00:00Z", completion_due: "2026-10-26T10:00:00Z", delivered_at: null }, now);
assert(late.missedResponse && late.missedCompletion && late.overdue, "in progress can also be overdue");
assert(!lateness({ ...base, status: "Cancelled", response_due: "2026-10-20T10:00:00Z" }, now).overdue, "closed requests are never overdue");
assert(Math.abs(distanceM({ lat: 10, lng: 76 }, { lat: 10.01, lng: 76 }) - 1112) < 5, "haversine distance");
console.log("Support workflow checks passed.");

// Infrastructure specifications: free-form rows, cleaned before saving.
import { cleanSpecs } from "../src/lib/support";
assert.deepEqual(cleanSpecs([{ label: " RAM ", value: " 8 GB " }, { label: "", value: "" }, { label: "", value: "orphan" }, null]), [{ label: "RAM", value: "8 GB" }, { label: "", value: "orphan" }]);
assert.deepEqual(cleanSpecs("not a list"), []);
assert.equal(cleanSpecs(Array.from({ length: 80 }, (_, i) => ({ label: `s${i}`, value: "" }))).length, 50);
console.log("Infrastructure specification checks passed.");

// Reference Data uploads: type and size are checked before anything is stored.
import { refFileError, REF_MAX_BYTES } from "../src/lib/support";
assert.equal(refFileError("Admissions Q3.XLSX", 1000), null);
assert.match(refFileError("run.exe", 1000)!, /not accepted/);
assert.match(refFileError("noextension", 1000)!, /not accepted/);
assert.match(refFileError("big.pdf", REF_MAX_BYTES + 1)!, /4 MB/);
assert.match(refFileError("empty.pdf", 0)!, /empty/);
console.log("Reference Data upload checks passed.");

// Reference Data spreadsheets: the ASO column is enforced and rows are grouped by ASO.
import * as XLSX from "xlsx";
import { parseSheet, sheetFile } from "../src/lib/sheet";
const xlsx = (aoa: unknown[][], origin = "A1") => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.sheet_add_aoa(XLSX.utils.aoa_to_sheet([]), aoa, { origin }), "S");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })).buffer as ArrayBuffer;
};
const csv = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const ASOS = ["Trivandrum", "Kannur & Kasaragode"];
const good = parseSheet(xlsx([["ASO Name", "Centre", "Fee"], ["Trivandrum", "A", 100], [" kannur  & KASARAGODE ", "B", 200], [], ["Trivandrum", "C", 300, ""]]), "a.xlsx", ASOS);
assert(!("error" in good));
assert.deepEqual(good.columns, ["ASO Name", "Centre", "Fee"]);
assert.deepEqual(good.parts.map(p => p.aso_key), ["trivandrum", "kannur & kasaragode"], "rows group by normalised ASO");
assert.deepEqual(good.parts[0].rows, [{ n: 2, cells: ["Trivandrum", "A", "100"] }, { n: 5, cells: ["Trivandrum", "C", "300"] }], "spreadsheet row numbers, no blank rows, trailing blank cells dropped");
const failure = (r: ReturnType<typeof parseSheet>) => ("error" in r ? r.error : "");
assert.match(failure(parseSheet(xlsx([["Centre", "ASO Name"], ["A", "Trivandrum"]]), "a.xlsx", ASOS)), /ASO Name/, "ASO Name must be first");
assert.match(failure(parseSheet(xlsx([["Centre"], ["A"]]), "a.xlsx", ASOS)), /ASO Name/, "ASO Name is required");
assert.match(failure(parseSheet(xlsx([["ASO Name"], ["Trivandrum"]], "B1"), "a.xlsx", ASOS)), /ASO Name/, "column A cannot be skipped");
assert.match(failure(parseSheet(xlsx([["ASO Name", "Centre"], ["", "A"], ["Trivandrum", "B"]]), "a.xlsx", ASOS)), /row 2/, "every row needs an ASO");
assert.match(failure(parseSheet(xlsx([["ASO Name", "Centre"], ["Trivandrm", "A"]]), "a.xlsx", ASOS)), /Trivandrm/, "unknown ASOs are refused");
assert.match(failure(parseSheet(xlsx([["ASO Name", "Centre"]]), "a.xlsx", ASOS)), /no data/);
assert.match(failure(parseSheet(xlsx([[]]), "a.xlsx", ASOS)), /ASO Name/, "an empty sheet is refused");
const big = parseSheet(xlsx([["ASO Name", "Text"], ...Array.from({ length: 800 }, (_, i) => ["Trivandrum", `${i}`.padEnd(5000, "x")])]), "a.xlsx", ASOS);
assert.match(failure(big), /too much/);
const text = parseSheet(csv("ASO Name,Code\nTrivandrum,00123\n"), "a.csv", ASOS);
assert(!("error" in text) && text.parts[0].rows[0].cells[1] === "00123", "a CSV keeps leading zeros");
const dated = XLSX.utils.aoa_to_sheet([["ASO Name", "On"], ["Trivandrum", new Date(Date.UTC(2026, 10, 3))]], { cellDates: true });
const datedBook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(datedBook, dated, "S");
const dd = parseSheet(new Uint8Array(XLSX.write(datedBook, { type: "array", bookType: "xlsx" })).buffer as ArrayBuffer, "a.xlsx", ASOS);
assert(!("error" in dd) && /^0?[23]-11-2026$/.test(dd.parts[0].rows[0].cells[1]), `dates read as dd-mm-yyyy (got ${"error" in dd ? dd.error : dd.parts[0].rows[0].cells[1]})`);
const back = XLSX.read(sheetFile(["ASO Name"], [["Trivandrum"]]), { type: "base64" });
assert.deepEqual(XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1 }), [["ASO Name"], ["Trivandrum"]]);
const oldBook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(oldBook, XLSX.utils.aoa_to_sheet([["ASO Name", "N"], ["Trivandrum", 1]]), "S");
const old = parseSheet(new Uint8Array(XLSX.write(oldBook, { type: "array", bookType: "biff8" })).buffer as ArrayBuffer, "a.xls", ASOS);
assert(!("error" in old) && old.parts[0].rows[0].cells[1] === "1", "legacy .xls files are read");
assert.match(failure(parseSheet(csv("%PDF-1.7 not a spreadsheet"), "a.xlsx", ASOS)), /ASO Name|could not be read/, "a non-spreadsheet is refused");
console.log("Reference Data spreadsheet checks passed.");

// Student feedback: form rules, server-side answer validation, file content checks, statistics, export.
import { blankQuestion, cleanForm, exportGrid, feedbackStats, FB_TYPES, fileContentMatches, formErrors, validateAnswers, type FbForm, type FbQuestion, type FbRow, type FbType } from "../src/lib/feedback";
import { gridFile, safeCsvCell } from "../src/lib/sheet";
const fq = (type: FbType, id: string, extra: Partial<FbQuestion> = {}): FbQuestion => ({ ...blankQuestion(type, id), title: `${type} question`, ...extra });
const opts = { options: ["Red", "Blue", "Green"] };
const fb: FbForm = { title: "T", description: "", items: [
  { id: "s1", kind: "s", title: "Part A", help: "" }, fq("short", "a", { required: true, min: 2, max: 5 }), fq("long", "b"), fq("choice", "c", opts), fq("checkbox", "d", { ...opts, min: 1, max: 2 }), fq("dropdown", "e", opts),
  fq("scale", "f"), fq("stars", "g"), fq("date", "h", { from: "2026-01-01", to: "2026-12-31" }), fq("time", "i", { from: "09:00", to: "17:00" }), fq("number", "j", { min: 0, max: 10, integer: true }), fq("range", "k", { min: 0, max: 10, step: 2 }), fq("email", "l"), fq("file", "m", { required: true, fileTypes: ["pdf"], maxMb: 1 }),
] };
assert.equal(Object.keys(FB_TYPES).length, 13, "all thirteen question types");
assert.deepEqual(formErrors(fb), []);
assert.deepEqual(cleanForm(JSON.parse(JSON.stringify(fb))), fb, "cleaning a good form changes nothing");
assert.equal(JSON.stringify(cleanForm({ ...fb, items: [...fb.items].reverse().reverse() })), JSON.stringify(fb), "key order is stable, so an unchanged form is recognised");
assert.equal(cleanForm({ items: [{ id: "x", kind: "q", type: "script" }, { id: "../bad", kind: "s" }, { id: "a", kind: "s" }, { id: "a", kind: "s" }] }).items.length, 1, "unknown types, bad and repeated ids are dropped");
const pub = (q: FbQuestion) => formErrors({ title: "T", description: "", items: [q] });
assert.match(formErrors({ title: "", description: "", items: [] }).join(" "), /title.*at least one question/);
assert.match(pub(fq("short", "z", { title: "" }))[0], /title/);
assert.match(pub(fq("choice", "z", { options: ["A", "a"] }))[0], /same option/);
assert.match(pub(fq("choice", "z", { options: ["A", ""] }))[0], /no blank/);
assert.match(pub(fq("scale", "z", { min: 3 }))[0], /scale/);
assert.match(pub(fq("stars", "z", { max: 2 }))[0], /stars/);
assert.match(pub(fq("range", "z", { min: 5, max: 1 }))[0], /minimum/);
assert.match(pub(fq("range", "z", { step: 0 }))[0], /step/);
assert.match(pub(fq("number", "z", { min: 5, max: 1 }))[0], /minimum/);
assert.match(pub(fq("file", "z", { maxMb: 99 }))[0], /file size/);
assert.match(pub(fq("date", "z", { from: "2026-02-31" }))[0], /invalid/);
const full = { a: "abc", b: "long", c: "Red", d: ["Green", "Red"], e: "Blue", f: "4", g: "5", h: "2026-06-01", i: "10:30", j: "7", k: "4", l: "me@x.org", m: { name: "a.pdf", size: 100 } };
const okA = validateAnswers(fb, { ...full, evil: "ignored" });
assert.deepEqual(okA.errors, {});
assert.deepEqual(okA.answers.d, ["Red", "Green"], "selections keep the form's order");
assert.equal(okA.answers.f, 4); assert.equal(okA.answers.k, 4); assert(!("evil" in okA.answers), "fields not on the form are ignored");
const bad = (patch: object, id: string) => { const e = validateAnswers(fb, { ...full, ...patch }).errors; assert(e[id], `${id} should fail for ${JSON.stringify(patch)}`); };
bad({ a: "" }, "a"); bad({ a: "x" }, "a"); bad({ a: "toolong" }, "a"); bad({ c: "Pink" }, "c"); bad({ d: ["Red", "Green", "Blue"] }, "d"); bad({ d: ["Pink"] }, "d"); bad({ e: "Pink" }, "e");
bad({ f: "6" }, "f"); bad({ g: "0" }, "g"); bad({ g: "2.5" }, "g"); bad({ h: "2026-02-31" }, "h"); bad({ h: "2027-01-01" }, "h"); bad({ i: "25:00" }, "i"); bad({ i: "08:00" }, "i");
bad({ j: "abc" }, "j"); bad({ j: "1.5" }, "j"); bad({ j: "11" }, "j"); bad({ k: "3" }, "k"); bad({ k: "12" }, "k"); bad({ l: "not-an-email" }, "l"); bad({ m: undefined }, "m"); bad({ m: { name: "a.exe", size: 10 } }, "m"); bad({ m: { name: "a.pdf", size: 2 * 1024 * 1024 } }, "m");
assert.deepEqual(Object.keys(validateAnswers(fb, { a: "abc", m: full.m }).errors), [], "optional questions may be left blank");
assert(fileContentMatches("a.pdf", new TextEncoder().encode("%PDF-1.7")));
assert(!fileContentMatches("a.pdf", new TextEncoder().encode("<html>")), "a renamed web page is refused");
assert(!fileContentMatches("a.png", new TextEncoder().encode("MZ......")), "a renamed program is refused");
assert(!fileContentMatches("a.txt", new Uint8Array([65, 0, 66])), "binary is not text");
const v2: FbForm = { title: "T", description: "", items: [fq("choice", "c", { title: "New wording", options: ["Red", "Blue"] }), fq("stars", "g")] };
const vs = new Map([[1, fb], [2, v2]]);
const resp: FbRow[] = [{ id: 2, version: 2, answers: { c: "Red", g: 4 }, submitted_at: "2026-11-02T10:00:00Z", status: "Verified", verified_at: "2026-11-03T10:00:00Z" }, { id: 1, version: 1, answers: { c: "Green", g: 2, a: "=1+1" }, submitted_at: "2026-11-01T10:00:00Z", status: "Pending Verification", verified_at: null }];
const stats = feedbackStats(vs, resp), st = (id: string) => stats.find(x => x.id === id)!;
assert.equal(st("c").title, "New wording", "a reworded question uses its latest title");
assert.deepEqual(st("c").counts, [["Red", 1], ["Blue", 0], ["Green", 1]], "answers to an option since removed still count");
assert.equal(st("g").avg, 3); assert.equal(st("g").answered, 2);
const grid = exportGrid(vs, resp, a => a ?? "");
assert.deepEqual(grid[0].slice(0, 6), ["Response", "Submitted", "Status", "Verified", "Form version", "New wording"]);
assert.equal(grid[2][5], "Green", "an old response keeps its original answer");
assert.equal(safeCsvCell("=1+1"), "'=1+1", "a formula in an answer cannot run from a CSV"); assert.equal(safeCsvCell(5), 5);
assert(gridFile(grid, "csv").toString("utf8").includes("'=1+1"));
assert.equal(XLSX.read(gridFile(grid, "xlsx"), { type: "buffer" }).SheetNames[0], "Responses");
console.log("Student feedback checks passed.");
