import { customerDocument } from "./customerDocument";
import { it, expect } from "vitest";
import { seed, takeoffToLine, migrate } from "./model";
import type { TakeoffItem } from "./model";
import {
  editTakeoff,
  reviewTakeoff,
  approveTakeoff,
  canConvert,
} from "./planAnalysis";
import { assertScope, includedScope } from "./takeoffScope";
import { consolidateTakeoff } from "./consolidateTakeoff";
const item = (delta: Partial<TakeoffItem> = {}): TakeoffItem => ({
  id: "takeoff",
  description: "Verified posts",
  quantity: 6,
  unit: "each",
  documentId: "plan",
  page: 1,
  notes: "source A",
  status: "Proposed",
  confidence: "High",
  origin: "ai",
  destination: "Materials",
  specification: "6x6 PT",
  category: "Posts",
  ...delta,
});
it("keeps existing/by-others excluded until explicit verified inclusion", () => {
  for (const workScope of ["Existing work", "By others"] as const) {
    const t = item({ workScope });
    expect(includedScope(t)).toBe(false);
    expect(() => reviewTakeoff(t)).toThrow();
    expect(canConvert({ ...t, status: "Approved" })).toBe(false);
    expect(
      includedScope(editTakeoff(t, { included: true, scopeVerified: true })),
    ).toBe(true);
  }
});
it("blocks alternative approvals and conversion, including retained priced provenance", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [
    item({
      id: "a",
      description: "Concrete footing",
      alternativeGroup: "Rear foundations",
      alternativeOption: "Concrete",
      status: "Approved",
      reviewAcknowledged: true,
    }),
    item({
      id: "b",
      description: "Helical pile",
      alternativeGroup: "Rear foundations",
      alternativeOption: "Helical",
      status: "Reviewed",
      reviewAcknowledged: true,
    }),
  ];
  expect(() => assertScope(q, approveTakeoff(q.takeoff[1]))).toThrow(
    "Mutually exclusive",
  );
  const first = takeoffToLine(q, q.takeoff[0], "Materials");
  expect(first.lines.at(-1)?.takeoffSource).toMatchObject({
    alternativeGroup: "Rear foundations",
    alternativeOption: "Concrete",
  });
  first.takeoff = first.takeoff.filter((t) => t.id === "b");
  const second = approveTakeoff(first.takeoff[0]);
  first.takeoff = [second];
  expect(() => takeoffToLine(first, second, "Materials")).toThrow(
    "Mutually exclusive",
  );
});
it("consolidates only exact unreviewed duplicates without losing source references or distinct specifications", () => {
  const a = item({ sourceDetailView: 1, sourceFacts: ["fact A"] });
  const b = item({
    id: "b",
    sourceDetailView: 2,
    sourceFacts: ["fact B"],
    notes: "source B",
    warnings: ["verify"],
    confidence: "Low",
  });
  const c = item({ id: "c", specification: "4x4 PT" });
  const d = item({ id: "d", page: 2 });
  const approved = item({ id: "e", status: "Approved" });
  const merged = consolidateTakeoff([a, b, c, d, approved]);
  expect(merged).toHaveLength(4);
  expect(merged[0].sourceFacts?.join(" ")).toContain("detail 2");
  expect(merged[0].sourceFacts).toContain("fact B");
  expect(merged[0].confidence).toBe("Low");
  expect(merged[3]).toEqual(approved);
  expect(a.sourceFacts).toEqual(["fact A"]);
});
it("calculator edits reset verification and approvals; safe conversion preserves manual lines and privacy", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  const original = structuredClone(q.lines);
  const t = item({
    calculation: {
      kind: "posts",
      inputs: { count: 6, waste: 0 },
      verified: true,
    },
    classification: "Calculated quantity",
    quantityMethod: "Calculated",
  });
  q.takeoff = [t];
  expect(() => reviewTakeoff({ ...t, quantity: 7 })).toThrow("calculator");
  const approved = approveTakeoff(reviewTakeoff(t));
  q.takeoff = [approved];
  const converted = takeoffToLine(q, approved, "Materials");
  expect(converted.lines.slice(0, -1)).toEqual(original);
  expect(() =>
    takeoffToLine(converted, converted.takeoff[0], "Materials"),
  ).toThrow();
  const edited = editTakeoff(approved, { specification: "6x6 cedar" });
  expect(edited).toMatchObject({
    status: "Proposed",
    quantity: null,
    calculation: { verified: false },
  });
  expect(canConvert(edited)).toBe(false);
  const store = seed();
  store.quotes = [converted];
  expect(migrate(store).quotes[0].takeoff[0].calculation).toEqual(
    t.calculation,
  );
  expect(JSON.stringify(customerDocument(converted))).not.toMatch(
    /alternativeGroup|calculation|sourceFacts|workScope|scopeVerified/,
  );
});

it("bulk approval is atomic when alternative methods conflict", async () => {
  const { approveTakeoffBatch } = await import("./planAnalysis");
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [
    item({
      id: "concrete",
      alternativeGroup: "Rear",
      alternativeOption: "Concrete",
      status: "Reviewed",
      reviewAcknowledged: true,
    }),
    item({
      id: "helical",
      alternativeGroup: "Rear",
      alternativeOption: "Helical",
      status: "Reviewed",
      reviewAcknowledged: true,
    }),
  ];
  const before = structuredClone(q);
  expect(() => approveTakeoffBatch(q, q.takeoff)).toThrow("Mutually exclusive");
  expect(q).toEqual(before);
});
it("potential foundation alternatives require explicit assembly choices but verified mixed designs remain possible", () => {
  const q = seed().quotes[0];
  q.takeoff = [
    item({ id: "a", description: "Concrete footing", location: "Rear" }),
    item({ id: "b", description: "Helical pile", location: "Rear" }),
  ];
  expect(() => assertScope(q, q.takeoff[0])).toThrow("explicit assembly");
  q.takeoff[0] = {
    ...q.takeoff[0],
    alternativeGroup: "Concrete assembly",
    alternativeOption: "Concrete",
  };
  q.takeoff[1] = {
    ...q.takeoff[1],
    alternativeGroup: "Helical assembly",
    alternativeOption: "Helical",
  };
  expect(() => assertScope(q, q.takeoff[0])).not.toThrow();
});
it("duplicate analysis evidence is saved privately without rewriting a reviewed item", async () => {
  const { analysisFixture } = await import("../shared/analysis.fixture");
  const { addAnalysisSuggestions } = await import("./planAnalysis");
  const q = seed().quotes[0];
  q.status = "Draft";
  q.documents = [
    {
      id: "plan",
      name: "synthetic.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64," + btoa("%PDF-1.7\n%%EOF"),
      addedAt: "2026-01-01",
    },
  ];
  const data = analysisFixture("plan");
  data.suggestions = [
    {
      ...data.suggestions[1],
      description: "6x6 PT posts",
      specification: "6x6 PT",
      scopeGroup: "Posts & Beams",
      category: "Posts",
      sourceDetailView: 1,
    },
  ];
  const first = addAnalysisSuggestions(q, data, "first");
  first.takeoff = [approveTakeoff(reviewTakeoff(first.takeoff[0]))];
  const original = structuredClone(first.takeoff);
  data.suggestions[0].sourceDetailView = 2;
  data.suggestions[0].notes = "Additional verified source reference";
  const second = addAnalysisSuggestions(first, data, "second");
  expect(second.takeoff).toEqual(original);
  expect(
    second.analysisReports?.at(-1)?.duplicateEvidence?.[0].sourceDetailView,
  ).toBe(2);
  const store = seed();
  store.quotes = [second];
  expect(
    migrate(store).quotes[0].analysisReports?.at(-1)?.duplicateEvidence?.[0]
      .sourceDetailView,
  ).toBe(2);
  expect(JSON.stringify(customerDocument(second))).not.toContain(
    "duplicateEvidence",
  );
});
it("corrupted calculator or alternative metadata cannot be imported", () => {
  const store = seed();
  store.quotes[0].takeoff = [
    item({ calculation: { kind: "bad", inputs: {}, verified: true } }),
  ];
  expect(() => migrate(store)).toThrow("invalid");
  store.quotes[0].takeoff = [item({ alternativeGroup: "x".repeat(201) })];
  expect(() => migrate(store)).toThrow("invalid");
});

it("keeps evidence-heavy duplicates separate instead of discarding facts or corrupting saved validation", () => {
  const a = item({
    sourceFacts: Array.from({ length: 20 }, (_, i) => `Source fact ${i}`),
  });
  const b = item({ id: "b", sourceFacts: ["Additional distinct fact"] });
  expect(consolidateTakeoff([a, b])).toEqual([a, b]);
  expect(
    consolidateTakeoff([
      item({ description: "" }),
      item({ id: "b", description: "" }),
    ]),
  ).toHaveLength(2);
});

it("existing-to-remain and unconfirmed scope cannot be forged into approval or pricing; by-others requires explicit inclusion", () => {
  for (const workScope of [
    "Existing work to remain",
    "Requires scope confirmation",
  ] as const) {
    const t = item({
      workScope,
      included: true,
      scopeVerified: true,
      status: "Approved",
      reviewAcknowledged: true,
    });
    expect(includedScope(t)).toBe(false);
    expect(canConvert(t)).toBe(false);
    expect(() => reviewTakeoff(t)).toThrow("contract scope");
    const q = seed().quotes[0];
    q.status = "Draft";
    q.takeoff = [t];
    expect(() => takeoffToLine(q, t, "Materials")).toThrow("scope inclusion");
  }
  const t = item({ workScope: "By others / excluded", included: false });
  expect(canConvert(t)).toBe(false);
  const included = editTakeoff(t, { included: true, scopeVerified: true });
  const approved = approveTakeoff(reviewTakeoff(included));
  expect(canConvert(approved)).toBe(true);
});
it("AI beam run counts cannot become boards by approval; verified purchase edits clear approval on further changes", () => {
  const t = item({
    description: "3-ply 2x10 beam",
    category: "Beams",
    quantity: 5,
    unit: "runs",
  });
  expect(() => reviewTakeoff(t)).toThrow("not purchase");
  const boards = editTakeoff(t, {
    quantity: 18,
    unit: "boards",
    purchaseVerified: true,
  });
  const approved = approveTakeoff(reviewTakeoff(boards));
  expect(canConvert(approved)).toBe(true);
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [approved];
  const before = q.lines.map((line) => ({ ...line }));
  const converted = takeoffToLine(q, approved, "Materials");
  expect(converted.lines.slice(0, before.length)).toEqual(before);
  expect(converted.lines.at(-1)?.quantity).toBe(18);
  expect(JSON.stringify(customerDocument(converted))).not.toMatch(
    /purchaseVerified|sourceFacts|confidence/,
  );
  expect(() => takeoffToLine(converted, approved, "Materials")).toThrow();
  const edited = editTakeoff(approved, { quantity: 20 });
  expect(edited.purchaseVerified).toBe(false);
  expect(canConvert(edited)).toBe(false);
});
