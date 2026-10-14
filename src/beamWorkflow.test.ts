import { customerDocument } from "./customerDocument";
import { relevantCalculators } from "./calculatorSelection";
import { it, expect } from "vitest";
import { seed, takeoffToLine, type TakeoffItem } from "./model";
import { beamLengthSuggestions } from "./BeamRunsEditor";
import {
  calculateMaterial,
  type MaterialCalculation,
  validCalculation,
} from "../shared/materialCalculators";
import { beamStockGroups } from "../shared/beamLumber";
import { approveSummaryMaterials, sendShoppingList } from "./materialsSummary";
const recipe: MaterialCalculation = {
  kind: "beam-runs",
  verified: true,
  inputs: {
    runs: 2,
    waste: 10,
    length1: 12,
    plies1: 3,
    stock1: 12,
    pieces1: 1,
    layout1: 1,
    length2: 16,
    plies2: 3,
    stock2: 16,
    pieces2: 1,
    layout2: 1,
  },
  specifications: { "1": "3-ply 2x10 PT", "2": "3-ply 2x10 PT" },
  arrangements: {
    "1": "Continuous boards, verified supports.",
    "2": "Continuous boards, verified supports.",
  },
};
const item: TakeoffItem = {
  id: "beam",
  description: "Deck beam",
  specification: "3-ply 2x10 PT",
  quantity: 8,
  unit: "boards",
  documentId: "synthetic",
  page: 2,
  confidence: "High",
  origin: "ai",
  status: "Proposed",
  destination: "Materials",
  category: "Beams",
  workScope: "New work",
  included: true,
  notes: "New work",
  sourceFacts: [
    "Beam B1 length: 12 ft",
    "Beam B1 length: 12 ft",
    "Beam B2 length: 16 ft",
  ],
  calculation: recipe,
  quantityMethod: "Calculated",
  calculationBasis: "Contractor verified lengths and continuous boards",
};
it("three ply separate beams retain distinct stock lengths and transparent group rounding", () => {
  expect(calculateMaterial(recipe).quantity).toBe(8);
  expect(beamStockGroups(recipe)).toMatchObject([
    { stock: 12, base: 3, quantity: 4 },
    { stock: 16, base: 3, quantity: 4 },
  ]);
  expect(beamStockGroups(recipe)[0].specification).toBe("2x10 PT");
});
it("same-stock confirmed separate runs group before waste without summing drawing observations", () => {
  const r = {
    ...recipe,
    inputs: { ...recipe.inputs, stock2: 12, length2: 12 },
  };
  expect(calculateMaterial(r).quantity).toBe(7);
  expect(beamStockGroups(r)).toHaveLength(1);
});
it("missing, unreadable specification and short stock cannot become approved purchase calculations", () => {
  for (const change of [
    { length1: null },
    { stock2: 12 },
    { layout1: null },
  ] as Record<string, number | null>[])
    expect(
      calculateMaterial({ ...recipe, inputs: { ...recipe.inputs, ...change } })
        .quantity,
    ).toBeNull();
  expect(
    calculateMaterial({
      ...recipe,
      specifications: { "1": "", "2": "2x10 PT" },
    }).quantity,
  ).toBeNull();
  expect(validCalculation({ ...recipe, specifications: { "1": 42 } })).toBe(
    false,
  );
});
it("labelled written beam lengths deduplicate repeated views and withhold ambiguous or unrelated dimensions", () => {
  expect(beamLengthSuggestions(item).map((m) => m.inches)).toEqual([144, 192]);
  expect(
    beamLengthSuggestions({
      ...item,
      sourceFacts: [
        "Beam B1 length: 12 ft",
        "Beam B1 length: 14 ft",
        "Deck width: 20 ft",
        "Beam B2 span: 16 ft",
      ],
    }),
  ).toEqual([]);
  expect(beamLengthSuggestions({ ...item, confidence: "Low" })).toEqual([]);
});
it("approved beam shopping list converts by stock length once and preserves manual lines", () => {
  const q = seed().quotes[0];
  q.takeoff = [item];
  const original = structuredClone(q.lines);
  const approved = approveSummaryMaterials(q, ["beam"], true),
    next = sendShoppingList(approved);
  expect(next.lines.slice(0, original.length)).toEqual(original);
  expect(next.lines.slice(original.length)).toMatchObject([
    { quantity: 4, description: "2x10 PT × 12 ft", cost: 0 },
    { quantity: 4, description: "2x10 PT × 16 ft", cost: 0 },
  ]);
  expect(JSON.stringify(customerDocument(next))).not.toContain(
    "Continuous boards, verified supports.",
  );
  expect(() => sendShoppingList(next)).toThrow();
  expect(() => takeoffToLine(next, approved.takeoff[0], "Materials")).toThrow();
});
it("existing, excluded and unresolved duplicate observations stay out of conversion", () => {
  for (const t of [
    { ...item, workScope: "Existing work to remain" as const },
    { ...item, included: false },
    { ...item, workScope: "By others / excluded" as const, included: false },
  ]) {
    const q = seed().quotes[0];
    q.takeoff = [t];
    expect(() => approveSummaryMaterials(q, ["beam"], true)).toThrow();
  }
  const q = seed().quotes[0];
  q.takeoff = [item, { ...item, id: "peer", page: 3 }];
  expect(() => approveSummaryMaterials(q, ["beam"], true)).toThrow();
});

it("calculator selection puts matching construction work first", () => {
  expect(relevantCalculators(item)).toEqual(["beam-runs", "beams"]);
  expect(
    relevantCalculators({
      ...item,
      description: "Deck joists",
      category: "Joists",
    })[0],
  ).toBe("joists");
  expect(
    relevantCalculators({
      ...item,
      description: "Joist hangers",
      category: "Hangers / connectors",
    })[0],
  ).toBe("hardware");
});
