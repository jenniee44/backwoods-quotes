import { expect, it } from "vitest";
import { analysisFixture } from "./analysis.fixture";
import { prepareConstructionAnalysis } from "./takeoff";
import { evidenceScope, purchaseQuantityProblem } from "./componentIdentity";
it.each([
  ["Posts", "6x6 PT", "6 × 6 pressure-treated"],
  ["Footings / concrete", "12 in concrete piers", "12 in concrete piers"],
  ["Beams", "3-ply 2x10 PT", "3 ply 2×10 PT"],
  ["Joists", "2x6 PT @ 16 in O/C", "2×6 PT @ 16 in O/C"],
  ["Hangers / connectors", "Simpson LUS26", "Simpson LUS26"],
  [
    "Structural fasteners",
    "Ledger screws SDWS 6 in",
    "Ledger screws SDWS 6 in",
  ],
  ["Ledger", "Aluminum ledger flashing .019", "Aluminum ledger flashing .019"],
  ["Guards / railings", "Aluminum guard 42 in", "Aluminum guard 42 in"],
])(
  "consolidates equivalent cross-view %s without summing and preserves equations/evidence",
  (category, a, b) => {
    const fixture = analysisFixture();
    const base = {
      ...fixture.suggestions[1],
      description: category,
      category,
      specification: a,
      location: "Rear deck",
      quantity: 4,
      quantityMethod: "Counted" as const,
      sourceFacts: ["Page 1 new work annotation"],
      calculationBasis: "Four unique positions in plan",
    };
    fixture.suggestions = [
      base,
      {
        ...base,
        page: 2,
        specification: b,
        sourceDetailView: 2,
        sourceFacts: ["Page 2 section corroborates the same four positions"],
        calculationBasis: "Section references plan positions",
        warnings: ["Verify on site"],
      },
    ];
    const result = prepareConstructionAnalysis(fixture);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].quantity).toBe(4);
    const evidence = result.suggestions[0].sourceFacts!.join(";");
    expect(evidence).toContain("page 1");
    expect(evidence).toContain("page 2");
    expect(evidence).toContain("Section references plan positions");
    expect(result.suggestions[0].warnings).toContain("Verify on site");
    expect(prepareConstructionAnalysis(result)).toEqual(result);
    fixture.suggestions[1].location = "Front deck";
    expect(prepareConstructionAnalysis(fixture).suggestions).toHaveLength(2);
  },
);
it("preserves conflicting hardware quantities rather than ordering or summing", () => {
  const fixture = analysisFixture();
  fixture.suggestions = [4, 8].map((quantity, index) => ({
    ...fixture.suggestions[1],
    description: "Ledger screws",
    category: "Structural fasteners",
    specification: "SDWS 6 in",
    location: "Rear ledger",
    page: index + 1,
    quantity,
    sourceFacts: ["New work ledger screw schedule"],
    quantityMethod: "Counted",
  }));
  const result = prepareConstructionAnalysis(fixture);
  expect(result.suggestions).toHaveLength(2);
  expect(result.suggestions.every((s) => s.quantity === null)).toBe(true);
  expect(result.suggestions[0].sourceFacts?.join()).toContain("4 each");
  expect(result.suggestions[1].sourceFacts?.join()).toContain("8 each");
});
it("classifies explicit existing/excluded scope without assuming a subcontract expense", () => {
  const base = analysisFixture().suggestions[1];
  expect(
    evidenceScope({
      ...base,
      notes: "Existing concrete pier and footing to remain",
    }),
  ).toBe("Existing work to remain");
  expect(evidenceScope({ ...base, notes: "Existing ledger to modify" })).toBe(
    "Existing work to remove or modify",
  );
  expect(evidenceScope({ ...base, notes: "Guards by others" })).toBe(
    "By others / excluded",
  );
  expect(evidenceScope({ ...base, notes: "Scope unreadable" })).toBe(
    "Requires scope confirmation",
  );
});
it("never equates beam runs with purchasable boards even when a verification flag is forged", () => {
  expect(
    purchaseQuantityProblem({
      description: "Beam",
      destination: "Materials",
      unit: "beam runs",
      purchaseVerified: true,
    }),
  ).toContain("not purchase");
  expect(
    purchaseQuantityProblem({
      description: "Beam",
      category: "Beams",
      origin: "ai",
      destination: "Materials",
      unit: "boards",
    }),
  ).toContain("lengths");
});

it("does not consolidate different explicit assembly marks or directional locations even within one broad area", () => {
  for (const descriptions of [
    ["Beam B1", "Beam B2"],
    ["North beam", "South beam"],
  ]) {
    const fixture = analysisFixture();
    fixture.suggestions = descriptions.map((description) => ({
      ...fixture.suggestions[1],
      description,
      category: "Beams",
      specification: "3-ply 2x10 PT",
      location: "Deck",
      quantity: 5,
    }));
    expect(prepareConstructionAnalysis(fixture).suggestions).toHaveLength(2);
  }
});

it("refuses consolidation when bounded fields cannot preserve all original evidence", () => {
  const fixture = analysisFixture();
  const base = {
    ...fixture.suggestions[1],
    description: "Posts",
    specification: "6x6 PT",
    location: "Rear deck",
    sourceFacts: Array.from({ length: 20 }, (_, i) => `First source fact ${i}`),
  };
  fixture.suggestions = [
    base,
    {
      ...base,
      page: 2,
      sourceFacts: Array.from(
        { length: 20 },
        (_, i) => `Second source fact ${i}`,
      ),
    },
  ];
  const result = prepareConstructionAnalysis(fixture);
  expect(result.suggestions).toHaveLength(2);
  expect(result.suggestions[0].sourceFacts).toContain("First source fact 19");
  expect(result.suggestions[1].sourceFacts).toContain("Second source fact 19");
});

it("does not combine ledger screws and bolts merely because their written size and broad category match", () => {
  const fixture = analysisFixture();
  fixture.suggestions = ["Ledger screws", "Ledger bolts"].map(
    (description) => ({
      ...fixture.suggestions[1],
      description,
      category: "Structural fasteners",
      specification: "6 in galvanized",
      location: "Rear ledger",
      quantity: 20,
    }),
  );
  expect(prepareConstructionAnalysis(fixture).suggestions).toHaveLength(2);
});
