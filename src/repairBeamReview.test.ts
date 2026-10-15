import { it, expect } from "vitest";
import { seed, type TakeoffItem } from "./model";
import { proposedBeamRecipe, enrichBeamRecipe } from "./beamPrefill";
import { repairBeamReview } from "./repairBeamReview";
import { consolidateCompared } from "./takeoffOverlap";
const beam: TakeoffItem = {
  id: "a",
  description: "Deck beams",
  category: "Beams",
  specification: "3PLY 2X10 PT",
  quantity: 3,
  unit: "runs",
  origin: "ai",
  status: "Proposed",
  confidence: "Low",
  classification: "Contractor input required",
  destination: "Materials",
  documentId: "synthetic",
  page: 1,
  notes: "New work",
  workScope: "New work",
  included: true,
  location: "Rear deck beam assembly",
  sourceFacts: [
    "Three distinct beam runs on the framing plan.",
    "Same beam runs shown in elevation.",
  ],
};
it("supported three proposed beam runs transfer without labels and parse 3PLY into all three plies", () => {
  const r = proposedBeamRecipe(beam)!;
  expect(r.inputs.runs).toBe(3);
  expect([r.inputs.plies1, r.inputs.plies2, r.inputs.plies3]).toEqual([
    3, 3, 3,
  ]);
  expect(r.inputs.length1).toBeUndefined();
  expect(r.verified).toBe(false);
});
it("reopening saved analyses and previously blank recipes fills missing count/plies and stays idempotent", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [
    beam,
    {
      ...beam,
      id: "blank",
      location: "Other deck",
      quantity: null,
      unit: "boards",
      calculation: { kind: "beam-runs", inputs: {}, verified: false },
    },
  ];
  const next = repairBeamReview(q);
  expect(next.takeoff.map((t) => t.calculation?.inputs.runs)).toEqual([3, 3]);
  expect(next.lines).toEqual(q.lines);
  expect(repairBeamReview(next)).toEqual(next);
});
it("manual counts, lengths, stock and intentional blanks survive missing-input repair", () => {
  const r = enrichBeamRecipe(beam, {
    kind: "beam-runs",
    verified: false,
    inputs: {
      runs: 3,
      plies1: 4,
      plies2: null,
      length1: 14,
      length2: null,
      stock1: 16,
    },
  });
  expect(r.inputs).toMatchObject({
    runs: 3,
    plies1: 4,
    plies2: null,
    plies3: 3,
    length1: 14,
    length2: null,
    stock1: 16,
  });
});
it("clear repeated views become one candidate while every original record and reference remains", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [1, 2, 3, 4].map((page) => ({
    ...beam,
    id: "beam-" + page,
    page,
  }));
  const next = repairBeamReview(q);
  expect(next.takeoff).toHaveLength(4);
  expect(next.takeoff.filter((t) => t.status === "Proposed")).toHaveLength(1);
  const retained = next.takeoff[0];
  expect(retained.calculation?.inputs.runs).toBe(3);
  expect(retained.quantity).toBeNull();
  expect(retained.sourceFacts?.join()).toContain("page 4");
});
it("different locations, conflicting run counts and verified records never merge or get overwritten", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [
    beam,
    { ...beam, id: "other", location: "Front deck" },
    {
      ...beam,
      id: "conflict",
      quantity: 4,
      sourceFacts: ["Four distinct beam runs on framing plan."],
    },
    {
      ...beam,
      id: "verified",
      calculation: { kind: "beam-runs", inputs: { runs: 5 }, verified: true },
    },
  ];
  const next = repairBeamReview(q);
  expect(next.takeoff.filter((t) => t.status === "Rejected")).toHaveLength(0);
  expect(next.takeoff.at(-1)).toEqual(q.takeoff.at(-1));
});
it("contractor comparison can combine unknown purchasing quantities with matching mechanical recipes, not conflicts", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  const r = proposedBeamRecipe(beam)!;
  q.takeoff = [
    { ...beam, quantity: null, unit: "boards", calculation: r },
    {
      ...beam,
      id: "b",
      page: 2,
      quantity: null,
      unit: "boards",
      calculation: { ...r, lengthSources: { "1": "Other page reference" } },
    },
  ];
  const next = consolidateCompared(q, q.takeoff[0], q.takeoff[1]);
  expect(next.takeoff[1].status).toBe("Rejected");
  expect(next.takeoff[0].quantity).toBeNull();
  expect(() =>
    consolidateCompared(q, q.takeoff[0], {
      ...q.takeoff[1],
      calculation: { ...r, inputs: { ...r.inputs, runs: 4 } },
    }),
  ).toThrow();
});
it("supported individual written dimensions remain proposed while missing or conflicting associations stay blank", () => {
  const r = proposedBeamRecipe({
    ...beam,
    quantity: null,
    sourceFacts: [
      "Beam B1 length: 12 ft 7 in",
      "Beam B2 length: 16 ft",
      "Beam B3 specification: 3PLY 2X10 PT",
    ],
  })!;
  expect(r.inputs.runs).toBe(3);
  expect(r.inputs.length1).toBeCloseTo(12 + 7 / 12);
  expect(r.inputs.length3).toBeUndefined();
  expect(r.lengthSources?.["1"]).toContain("12 ft 7 in");
  expect(r.verified).toBe(false);
});

import { addAnalysisSuggestions } from "./planAnalysis";
import { analysisFixture } from "../shared/analysis.fixture";
it("fresh analysis preserves the original proposed run count when purchasing normalization clears quantity", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.documents = [
    {
      id: "synthetic",
      name: "Synthetic plan.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQK",
      addedAt: "2026-01-01",
    },
  ];
  const result = analysisFixture("synthetic");
  result.suggestions = [
    {
      ...result.suggestions[0],
      description: "Deck beams",
      specification: "3PLY 2X10 PT",
      quantity: 3,
      unit: "runs",
      confidence: "High",
      classification: "Plan fact",
      destination: "Materials",
      category: "Beams",
      notes: "New work",
      sourceFacts: ["Beam run count is proposed from framing view."],
      assumptions: [],
      warnings: [],
    },
  ];
  const next = addAnalysisSuggestions(q, result),
    t = next.takeoff[0];
  expect(t.calculation?.inputs.runs).toBe(3);
  expect(t.calculation?.inputs.plies3).toBe(3);
  expect(t.quantity).toBeNull();
  expect(t.notes).toContain("Original proposed observation: 3 runs");
});
