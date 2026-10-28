import { it, expect } from "vitest";
import {
  proposedBeamRecipe,
  suggestedStock,
  beamLengthSuggestions,
  beamNextStep,
} from "./beamPrefill";
import { seed, type TakeoffItem } from "./model";
import { addAnalysisSuggestions } from "./planAnalysis";
import { analysisFixture } from "../shared/analysis.fixture";
import {
  calculateMaterial,
  validCalculation,
} from "../shared/materialCalculators";
const item: TakeoffItem = {
  id: "b",
  description: "Deck beams",
  specification: "3PLY 2X10 PT",
  quantity: null,
  unit: "runs",
  documentId: "synthetic",
  page: 1,
  confidence: "High",
  status: "Proposed",
  origin: "ai",
  destination: "Materials",
  category: "Beams",
  workScope: "New work",
  included: true,
  notes: "New work",
  sourceFacts: [
    "Beam B1 length: 12 ft",
    "Beam B-1 length: 12 ft",
    "Beam B2 length: 16 ft",
    "Beam B1 uses continuous unspliced boards.",
  ],
};
it("explicit 3PLY and distinct beam labels automatically prefill proposed inputs with references", () => {
  const r = proposedBeamRecipe(item)!;
  expect(r.inputs).toMatchObject({
    runs: 2,
    plies1: 3,
    plies2: 3,
    length1: 12,
    length2: 16,
    pieces1: 1,
  });
  expect(r.lengthSources?.["1"]).toContain("page 1");
  expect(r.specificationSources?.["1"]).toContain("3PLY");
  expect(r.verified).toBe(false);
  expect(calculateMaterial(r).quantity).toBeNull();
});
it("conflicting and missing lengths stay unknown and repeated aliases never create extra runs", () => {
  const r = proposedBeamRecipe({
    ...item,
    sourceFacts: [
      "Beam B1 length: 12 ft",
      "Beam B-1 length: 14 ft",
      "Beam B2 specification: 3PLY 2X10 PT",
    ],
  })!;
  expect(r.inputs.runs).toBe(2);
  expect(r.inputs.length1).toBeUndefined();
  expect(r.inputs.length2).toBeUndefined();
  expect(beamNextStep(r, 1)).toContain("length could not be confirmed");
  expect(
    beamLengthSuggestions({
      ...item,
      sourceFacts: ["Beam B1 and Beam B2 length: 12 ft"],
    }),
  ).toEqual([]);
});
it("stock suggestions require explicitly configured availability and never verify cutting arrangements", () => {
  const r = proposedBeamRecipe(item)!;
  expect(suggestedStock(r, 1)).toBeNull();
  const configured = { ...r, availableStock: [16, 12, 10] };
  expect(suggestedStock(configured, 1)).toBe(12);
  expect(suggestedStock(configured, 2)).toBe(16);
  expect(calculateMaterial(configured).quantity).toBeNull();
  expect(validCalculation({ ...r, availableStock: [-1] })).toBe(false);
});
it("excluded, existing, by-others, low confidence and unlabelled work never auto-populate purchasing", () => {
  for (const t of [
    { ...item, included: false },
    { ...item, workScope: "Existing work to remain" as const },
    { ...item, workScope: "By others / excluded" as const, included: false },
    { ...item, confidence: "Low" as const },
    { ...item, sourceFacts: ["Beam span 12 ft; deck width 16 ft"] },
  ])
    expect(proposedBeamRecipe(t)).toBeNull();
});

it("completed analysis automatically adopts proposed beam inputs without changing existing entries", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.documents = [
    {
      id: "synthetic",
      name: "Synthetic plan",
      type: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQK",
      addedAt: "2026-01-01",
    },
  ];
  const existing = structuredClone(q.takeoff),
    lines = structuredClone(q.lines),
    result = analysisFixture("synthetic");
  result.suggestions = [
    {
      ...result.suggestions[0],
      description: item.description,
      specification: item.specification,
      destination: "Materials",
      category: "Beams",
      confidence: "High",
      quantity: null,
      unit: "runs",
      notes: "New work",
      assumptions: [],
      warnings: [],
      sourceFacts: item.sourceFacts,
    },
  ];
  const next = addAnalysisSuggestions(q, result);
  const beam = next.takeoff.find((t) => t.category === "Beams")!;
  expect(beam.calculation?.inputs.plies1).toBe(3);
  expect(beam.calculation?.inputs.runs).toBe(2);
  expect(beam.quantity).toBeNull();
  expect(beam.status).toBe("Proposed");
  expect(beam.confidence).toBe("Low");
  expect(next.lines).toEqual(lines);
  expect(next.takeoff.slice(0, existing.length)).toEqual(existing);
});

it("manual estimating edits and unrelated continuous joist notes do not become beam drawing facts", () => {
  expect(
    proposedBeamRecipe({ ...item, classification: "Estimating suggestion" }),
  ).toBeNull();
  expect(
    proposedBeamRecipe({
      ...item,
      sourceFacts: ["Beam B1 length: 12 ft; joist boards are continuous"],
    })?.inputs.pieces1,
  ).toBeUndefined();
});
it.each([
  "2x6 ledger board",
  "Ledger board and aluminum flashing",
  "Aluminum flashing",
])("rejects misplaced beam metadata on %s", (description) => {
  const t = { ...item, description, category: "Beams" };
  expect(proposedBeamRecipe(t)).toBeNull();
});
it("uses explicit ledger identity rather than an incorrect beam category for tool selection", async () => {
  const { relevantCalculators } = await import("./calculatorSelection");
  expect(
    relevantCalculators({
      ...item,
      description: "PT member",
      specification: "2x6 ledger board",
      category: "Beams",
    }),
  ).toEqual(["ledger"]);
  expect(
    relevantCalculators({
      ...item,
      description: "Aluminum flashing",
      category: "Beams",
    }),
  ).toEqual(["railing"]);
});
