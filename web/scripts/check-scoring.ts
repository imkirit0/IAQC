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
