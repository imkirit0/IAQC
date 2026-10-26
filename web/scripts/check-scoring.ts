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
