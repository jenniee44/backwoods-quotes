import { expect, it } from "vitest";
import { defaults, newQuote, takeoffToLine } from "./model";
import type { TakeoffItem } from "./model";
import { reviewBucket, readyForEstimate } from "./takeoffReview";
import {
  approveTakeoff,
  reviewTakeoff,
  editTakeoff,
  canConvert,
} from "./planAnalysis";
import { consolidateTakeoff } from "./consolidateTakeoff";
import { completenessProblem } from "./takeoffRequirements";
const item = (delta: Partial<TakeoffItem> = {}): TakeoffItem => ({
  id: "post",
  description: "6x6 posts",
  specification: "6x6 PT",
  location: "Rear deck",
  category: "Posts",
  destination: "Materials",
  quantity: 4,
  unit: "each",
  documentId: "plan",
  page: 1,
  confidence: "High",
  status: "Proposed",
  origin: "ai",
  notes: "New work",
  workScope: "New work",
  included: true,
  ...delta,
});
function quote(t = item()) {
  const q = newQuote(defaults, []);
  q.takeoff = [t];
  return q;
}
it("assigns one actionable summary bucket without repeating missing warnings", () => {
  for (const [delta, bucket] of [
    [{}, "Ready for review"],
    [{ quantity: null }, "Needs quantity or specification"],
    [{ specification: "Unreadable" }, "Needs quantity or specification"],
    [
      { workScope: "Requires scope confirmation", included: false },
      "Needs scope confirmation",
    ],
    [{ status: "Rejected" }, "Excluded or informational"],
    [{ workScope: "Existing work to remain" }, "Excluded or informational"],
    [{ destination: "Informational" }, "Excluded or informational"],
    [
      { warnings: ["Conflicting counts: 4 vs 6"] },
      "Potential duplicates or conflicts",
    ],
  ] as [Partial<TakeoffItem>, string][]) {
    const t = item(delta);
    expect(reviewBucket(quote(t), t)).toBe(bucket);
  }
});
it("potential overlaps and foundation alternatives are never ready for quick approval", () => {
  const q = quote();
  q.takeoff.push(item({ id: "second", quantity: 6 }));
  expect(reviewBucket(q, q.takeoff[0])).toBe(
    "Potential duplicates or conflicts",
  );
  expect(readyForEstimate(q, q.takeoff[0])).toBe(false);
});
it("verified approval is separate from conversion and quick edits reset it", () => {
  const t = approveTakeoff(reviewTakeoff(item()));
  const q = quote(t);
  expect(readyForEstimate(q, t)).toBe(true);
  expect(q.lines).toHaveLength(0);
  const changed = editTakeoff(t, { quantity: 5 });
  expect(changed.status).toBe("Proposed");
  expect(readyForEstimate(quote(changed), changed)).toBe(false);
});
it.each([
  "",
  "unreadable",
  "unknown",
  "Requires contractor input",
  "Not readable",
  "PT member, size unreadable",
])(
  "missing or unreadable specification %s cannot bypass quick review via advanced approval or conversion",
  (specification) => {
    const t = item({ specification });
    expect(() => reviewTakeoff(t)).toThrow("specification");
    const forged = {
      ...t,
      status: "Approved" as const,
      reviewAcknowledged: true,
    };
    expect(canConvert(forged)).toBe(false);
    expect(() => takeoffToLine(quote(forged), forged, "Materials")).toThrow(
      "specification",
    );
  },
);
it("conflicts require explicit reconciliation; original warnings remain and edits invalidate verification", () => {
  const t = item({ warnings: ["Conflicting counts: 4 vs 6"], quantity: 4 });
  expect(() => reviewTakeoff(t)).toThrow("conflicting");
  const resolved = editTakeoff(t, { conflictsVerified: true });
  const approved = approveTakeoff(reviewTakeoff(resolved));
  expect(approved.warnings).toEqual(t.warnings);
  expect(readyForEstimate(quote(approved), approved)).toBe(true);
  expect(editTakeoff(approved, { quantity: 6 }).conflictsVerified).toBe(false);
});
it("document observations are not purchasable even with forged approval", () => {
  for (const itemRole of [
    "Document observation",
    "Supporting evidence",
  ] as const) {
    const t = item({ itemRole, status: "Approved", reviewAcknowledged: true });
    expect(completenessProblem(t)).toContain("observations");
    expect(canConvert(t)).toBe(false);
    expect(() => takeoffToLine(quote(t), t, "Materials")).toThrow(
      "observations",
    );
  }
});
it("automatic grouping combines only explicit equivalent unreviewed AI sources without adding counts", () => {
  const a = item({
    sourceFacts: ["Page 1 four posts"],
    notes: "New work page 1",
  });
  const b = item({
    id: "b",
    page: 2,
    description: "Pressure-treated posts",
    sourceFacts: ["Page 2 same four posts"],
    notes: "New work page 2",
  });
  const grouped = consolidateTakeoff([a, b], true);
  expect(grouped).toHaveLength(1);
  expect(grouped[0].quantity).toBe(4);
  expect(grouped[0].sourceFacts!.join(";")).toMatch(/page 1.*page 2/i);
  expect([a, b].map((t) => t.notes)).toEqual([
    "New work page 1",
    "New work page 2",
  ]);
});
it("automatic grouping preserves conflicts, distinct locations, methods, reviewed items and manual entries", () => {
  const a = item();
  for (const delta of [
    { quantity: 6 },
    { location: "Landing" },
    { specification: "6x6 cedar" },
    { alternativeGroup: "foundation", alternativeOption: "different" },
    { status: "Reviewed" },
    { origin: undefined },
    { documentId: "" },
  ] as Partial<TakeoffItem>[])
    expect(
      consolidateTakeoff([a, item({ id: "b", ...delta })], true),
    ).toHaveLength(2);
});
it("beam runs never become boards through quick approval", () => {
  const t = item({
    description: "3-ply beam",
    category: "Beams",
    unit: "runs",
    quantity: 5,
  });
  expect(reviewBucket(quote(t), t)).toBe("Needs quantity or specification");
  expect(() => reviewTakeoff(t)).toThrow("purchase");
});

it("consolidating additional evidence resets prior verifications without deleting warnings", () => {
  const a = item({
    scopeVerified: true,
    purchaseVerified: true,
    conflictsVerified: true,
    warnings: ["Conflicting counts previously reconciled"],
  });
  const grouped = consolidateTakeoff([a, item({ id: "other", page: 2 })], true);
  expect(grouped).toHaveLength(1);
  expect(grouped[0]).toMatchObject({
    scopeVerified: false,
    purchaseVerified: false,
    conflictsVerified: false,
  });
  expect(grouped[0].warnings).toEqual(a.warnings);
});

it("automatic grouping does not combine differently named assemblies within a broad drawing location", () => {
  const a = item({ description: "Outer 6x6 posts" });
  for (const description of ["Inner 6x6 posts", "6x6 posts", "Post assembly 2"])
    expect(
      consolidateTakeoff([a, item({ id: "other", description })], true),
    ).toHaveLength(2);
});
