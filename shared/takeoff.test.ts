import { it, expect } from "vitest";
import { analysisFixture } from "./analysis.fixture";
import { validateAnalysis } from "./analysis";
import type { AnalysisSuggestion } from "./analysis";
import { prepareConstructionAnalysis, semanticItemKey } from "./takeoff";
const component = (
  changes: Partial<AnalysisSuggestion> = {},
): AnalysisSuggestion => ({
  ...analysisFixture().suggestions[1],
  description: "Concrete footings/piers",
  quantity: 7,
  unit: "each",
  scopeGroup: "Footings & Foundations",
  specification: "Footing specification unreadable",
  sourceFacts: [
    "Seven distinct footing locations identified on foundation plan, page 1",
  ],
  calculationBasis:
    "Count of seven distinct footing locations; verify against footing schedule",
  quantityMethod: "Counted",
  itemRole: "Construction item",
  location: "Main deck",
  subcontractorBasis: "Not established",
  classification: "Calculated quantity",
  confidence: "Medium",
  warnings: ["Verify footing depth and diameter before pricing"],
  ...changes,
});
function result(items: AnalysisSuggestion[]) {
  return { ...analysisFixture(), suggestions: items };
}
it("keeps supported construction scope, specifications and calculation evidence, not view counts", () => {
  const data = result([
    component(),
    component({
      description: "Visible support/footing locations",
      itemRole: "Supporting evidence",
      specification: "",
      calculationBasis: "",
      notes: "Counted locations, not a separate material",
    }),
    component({
      description: "Elevation views",
      itemRole: "Document observation",
      quantity: 3,
    }),
    component({
      description: "Joists",
      specification: '2x8 PT @ 16" O/C',
      quantity: 11,
      scopeGroup: "Framing",
      sourceFacts: [
        "Readable framing width 160 inches, 16 inch joist spacing, both edges included",
      ],
      calculationBasis: "160 / 16 + 1 = 11 joists; verify edge layout",
      quantityMethod: "Calculated",
    }),
  ]);
  const validated = validateAnalysis(data, ["plan"]);
  expect(validated.suggestions).toHaveLength(2);
  expect(validated.suggestions[0].sourceFacts?.join(" ")).toContain(
    "Visible support/footing locations",
  );
  expect(validated.suggestions[1]).toMatchObject({
    quantity: 11,
    classification: "Calculated quantity",
    calculationBasis: "160 / 16 + 1 = 11 joists; verify edge layout",
  });
  expect(validated.summary?.readableSpecifications.join(" ")).toContain(
    '2x8 PT @ 16" O/C',
  );
  expect(validated.summary?.observations.join(" ")).toContain(
    "Elevation views",
  );
  expect(data.suggestions).toHaveLength(4); // Input is never modified.
});
it("reduces narrow semantic synonyms without merging different components, locations, sizes or conflicting counts", () => {
  const base = component();
  const data = result([
    base,
    component({
      description: "Concrete piers",
      notes: "Footing detail reference F2",
      confidence: "Low",
    }),
    component({ description: "Posts" }),
    component({ quantity: 8 }),
    component({ location: "Landing" }),
    component({ specification: '12" diameter piers' }),
  ]);
  const prepared = prepareConstructionAnalysis(data);
  expect(prepared.suggestions).toHaveLength(5);
  expect(prepared.duplicatesReduced).toBe(1);
  expect(prepared.suggestions[0].confidence).toBe("Low");
  expect(
    prepared.suggestions
      .find((item) =>
        item.sourceFacts?.some((fact) =>
          fact.includes("Conflicting source count: 8"),
        ),
      )!
      .warnings?.join(" "),
  ).toContain("Conflicting quantities");
  expect(prepared.suggestions[0].sourceFacts).toContain(
    "Footing detail reference F2",
  );
  expect(prepareConstructionAnalysis(prepared)).toEqual(prepared);
  expect(semanticItemKey(base)).not.toBe(
    semanticItemKey(component({ destination: "Labour" })),
  );
});
it("routes legacy drawing metadata to summary even when mislabeled as materials", () => {
  const prepared = prepareConstructionAnalysis(
    result([
      component({ description: "Drawing sheet identifier" }),
      component({ description: "Framing plan present" }),
      component(),
    ]),
  );
  expect(prepared.suggestions).toHaveLength(1);
  expect(prepared.summary?.observations).toHaveLength(2);
});
it.each([
  { quantityMethod: "Scaled" as const, calculationBasis: "Image pixel ratio" },
  {
    quantityMethod: "Calculated" as const,
    calculationBasis: "",
    sourceFacts: [],
  },
  { quantityMethod: "Counted" as const, sourceFacts: [] },
  { quantityMethod: "Unknown" as const },
])("leaves unsupported/unreadable measurements blank: %j", (changes) => {
  const prepared = validateAnalysis(result([component(changes)]), ["plan"]);
  expect(prepared.suggestions[0]).toMatchObject({
    quantity: null,
    confidence: "Low",
    classification: "Contractor input required",
  });
});
it("DO NOT SCALE blocks visually scaled dimensions but does not discard written dimensions", () => {
  const data = result([component()]);
  data.dimensions = [
    component({
      description: "Deck width",
      quantity: 16,
      unit: "ft",
      quantityMethod: "Written",
      classification: "Plan fact",
      sourceFacts: ["Written 16 ft dimension"],
    }),
    component({
      description: "Unreadable depth",
      quantity: 12,
      unit: "ft",
      quantityMethod: "Scaled",
      calculationBasis: "visually scaled from drawing",
    }),
  ];
  const prepared = validateAnalysis(data, ["plan"]);
  expect(prepared.dimensions![0].quantity).toBe(16);
  expect(prepared.dimensions![1].quantity).toBeNull();
});
it("normal stairs/carpentry assembly is not subcontracted and labour hours are never inferred", () => {
  const prepared = validateAnalysis(
    result([
      component({
        description: "Deck stairs assembly",
        destination: "Subcontractor",
        category: "Other Subcontractor",
        sourceFacts: ["Stair scope shown in plan"],
        quantity: 2,
        calculationBasis: "",
        classification: "Estimating suggestion",
      }),
      component({
        description: "Deck framing labour",
        destination: "Labour",
        quantity: 40,
        unit: "hours",
        quantityMethod: "Calculated",
      }),
    ]),
    ["plan"],
  );
  for (const item of prepared.suggestions)
    expect(item).toMatchObject({
      destination: "Labour",
      quantity: null,
      unit: "hours",
      confidence: "Low",
    });
  expect(prepared.suggestions[0].subcontractorBasis).toBe("Not established");
});
it("retains explicit by-others work but never assumes specialized trades are subcontracted", () => {
  const prepared = validateAnalysis(
    result([
      component({
        description: "Deck stairs assembly",
        destination: "Subcontractor",
        sourceFacts: ["Stairs by others, stair detail page 1"],
        subcontractorBasis: "Explicit by others",
      }),
      component({
        description: "Plumbing rough-in",
        destination: "Subcontractor",
        category: "Plumbing",
        sourceFacts: ["Plumbing rough-in identified"],
        subcontractorBasis: "Separate trade suggestion",
      }),
    ]),
    ["plan"],
  );
  expect(prepared.suggestions[0].destination).toBe("Subcontractor");
  expect(prepared.suggestions[1].destination).not.toBe("Subcontractor");
  expect(prepared.suggestions[1].subcontractorBasis).toBe("Not established");
  expect(prepared.suggestions[1].warnings?.join(" ")).toContain(
    "Confirm who performs this scope",
  );
});
it.each([
  { sourceFacts: "not an array" },
  { calculationBasis: 12 },
  { quantityMethod: "Guessed" },
  { scopeGroup: {} },
  { itemRole: "Approved material" },
  { subcontractorBasis: "Always subcontracted" },
])("rejects malformed evidence fields: %j", (changes) => {
  const data = result([component()]);
  Object.assign(data.suggestions[0], changes);
  expect(() => validateAnalysis(data, ["plan"])).toThrow();
});
it("rejects malformed summaries and preserves old response compatibility", () => {
  const data = result([component()]);
  Object.assign(data, { summary: { majorScope: "Framing" } });
  expect(() => validateAnalysis(data, ["plan"])).toThrow();
  expect(
    validateAnalysis(analysisFixture(), ["plan"]).suggestions,
  ).toHaveLength(2);
});

it("empty generic labour observations are not converted into useless hour-entry rows", () => {
  const prepared = prepareConstructionAnalysis(
    result([
      component({ description: "Labour", destination: "Labour" }),
      component({ description: "Deck framing labour", destination: "Labour" }),
    ]),
  );
  expect(prepared.suggestions).toHaveLength(1);
  expect(prepared.suggestions[0]).toMatchObject({
    description: "Deck framing labour",
    quantity: null,
  });
});

it("numeric-prefix source observations stay summary-only and unreadable specifications remain unknown", () => {
  const prepared = validateAnalysis(
    result([
      component(),
      component({
        description: "7 visible support/post/footing locations",
        itemRole: "Construction item",
      }),
    ]),
    ["plan"],
  );
  expect(prepared.suggestions).toHaveLength(1);
  expect(prepared.summary?.readableSpecifications).not.toContain(
    "Concrete footings/piers: Footing specification unreadable",
  );
  expect(prepared.summary?.majorUnknowns).toContain(
    "Concrete footings/piers: Footing specification unreadable",
  );
});
it("negative subcontracting evidence cannot turn normal stairs into a subcontractor", () => {
  const prepared = validateAnalysis(
    result([
      component({
        description: "Stairs assembly",
        destination: "Subcontractor",
        category: "Other Subcontractor",
        sourceFacts: ["No by others designation is shown"],
        subcontractorBasis: undefined,
      }),
    ]),
    ["plan"],
  );
  expect(prepared.suggestions[0]).toMatchObject({
    destination: "Labour",
    quantity: null,
  });
});
it("separate construction scope groups are not merged even when quantities and descriptions match", () => {
  const prepared = prepareConstructionAnalysis(
    result([
      component({ scopeGroup: "Front Footings" }),
      component({ scopeGroup: "Rear Footings" }),
    ]),
  );
  expect(prepared.suggestions).toHaveLength(2);
});
