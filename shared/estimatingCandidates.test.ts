import { it, expect } from "vitest";
import { deckTakeoffFixture } from "./deckTakeoff.fixture";
import { validateAnalysis, materialCategories } from "./analysis";
import { prepareConstructionAnalysis, materialCategoryFor } from "./takeoff";
it("promotes readable specifications into distinct material candidates without inventing purchase quantities", () => {
  const source = deckTakeoffFixture();
  const result = validateAnalysis(source, ["plan"]);
  expect(result.suggestions).toHaveLength(5);
  expect(result.suggestions.map((item) => item.category)).toEqual([
    "Posts",
    "Beams",
    "Joists",
    "Hangers / connectors",
    "Footings / concrete",
  ]);
  expect(result.suggestions[0]).toMatchObject({
    quantity: 3,
    quantityMethod: "Counted",
    classification: "Plan fact",
    confidence: "High",
    destination: "Materials",
  });
  expect(result.suggestions[1]).toMatchObject({
    quantity: 4,
    unit: "runs",
    specification: "3-ply 2x10 PT beams",
  });
  expect(result.suggestions[2]).toMatchObject({
    quantity: null,
    specification: "2x6 PT deck joists @ 16 in. O.C.",
    classification: "Contractor input required",
    confidence: "Low",
  });
  expect(result.suggestions[3]).toMatchObject({
    quantity: null,
    specification: "Simpson LUS26",
  });
  expect(result.sourceObservations![2]).toMatchObject({
    confidence: "High",
    classification: "Plan fact",
    quantity: null,
  });
  expect(
    result.suggestions.some((item) =>
      /sheet|Posts \/ beams/i.test(item.description),
    ),
  ).toBe(false);
  expect(source.suggestions).toHaveLength(1); // Input and saved quotes never rewritten.
  expect(prepareConstructionAnalysis(result)).toEqual(result); // Provider/server/client normalization is idempotent.
});
it("keeps total visible and apparent new supports separate rather than conflicting or ordering the visible total", () => {
  const result = validateAnalysis(deckTakeoffFixture(), ["plan"]);
  expect(
    result.sourceObservations!.find(
      (item) => item.supportBasis === "Total visible locations",
    ),
  ).toMatchObject({ quantity: 12 });
  expect(
    result.suggestions.find((item) => item.category === "Footings / concrete"),
  ).toMatchObject({ quantity: 7, supportBasis: "Apparent new work" });
  expect(result.suggestions.some((item) => item.quantity === 12)).toBe(false);
  expect(
    result.suggestions.flatMap((item) => item.warnings ?? []).join(" "),
  ).not.toContain("Conflicting quantities");
});
it.each(materialCategories)(
  "keeps a useful material category: %s",
  (category) => {
    const descriptions: Record<string, string> = {
      Posts: "6x6 posts",
      Beams: "Beam runs",
      Joists: "Joists",
      Ledger: "Ledger board",
      Blocking: "Blocking",
      "Footings / concrete": "Concrete footings",
      "Hangers / connectors": "Post base connectors",
      "Structural fasteners": "Ledger bolts",
      Decking: "Decking",
      "Fascia / trim": "Fascia boards",
      "Guards / railings": "Guard railing",
      "Stairs / stringers": "Stair stringers",
    };
    expect(
      materialCategoryFor({
        ...deckTakeoffFixture().sourceObservations![0],
        description: descriptions[category],
      }),
    ).toBe(category);
  },
);
it("does not derive quantities by scaling or create candidates from unproven summary prose", () => {
  const data = deckTakeoffFixture();
  data.summary = {
    majorScope: [],
    majorUnknowns: [],
    readableSpecifications: ["Unsupported summary-only size 2x12"],
    siteVerification: [],
    observations: [],
  };
  const joists = data.sourceObservations![2];
  joists.quantity = 22;
  joists.quantityMethod = "Scaled";
  joists.calculationBasis = "Visually scaled from drawing with DO NOT SCALE";
  const result = validateAnalysis(data, ["plan"]);
  expect(
    result.suggestions.find((item) => item.category === "Joists")!.quantity,
  ).toBeNull();
  expect(
    result.sourceObservations!.find(
      (item) => item.description === joists.description,
    )!.quantity,
  ).toBeNull();
  expect(
    result.suggestions.some((item) => item.specification?.includes("2x12")),
  ).toBe(false);
});
it("detail provenance must refer to an actual supplied crop on the same page", () => {
  const data = deckTakeoffFixture();
  data.sourceObservations![0].sourceDetailView = 2;
  expect(() =>
    validateAnalysis(
      data,
      ["plan"],
      [
        {
          id: "plan",
          name: "plan.pdf",
          type: "application/pdf",
          data: "original",
        },
      ],
    ),
  ).toThrow();
  for (const bad of [0, 25, "1"]) {
    Object.assign(data.sourceObservations![0], { sourceDetailView: bad });
    expect(() => validateAnalysis(data, ["plan"])).toThrow();
  }
});
it("same-basis conflicts still remain visible; different support bases are not duplicates", () => {
  const data = deckTakeoffFixture();
  data.sourceObservations!.push({
    ...data.sourceObservations![5],
    quantity: 8,
  });
  const prepared = validateAnalysis(data, ["plan"]);
  expect(
    prepared.suggestions.filter(
      (item) => item.category === "Footings / concrete",
    ),
  ).toHaveLength(2);
  expect(
    prepared.suggestions
      .find((item) => item.quantity === 8)!
      .warnings!.join(" "),
  ).toContain("Conflicting quantities");
});
it("metadata and unsupported specifications never become material rows", () => {
  const data = deckTakeoffFixture();
  data.sourceObservations = [
    {
      ...data.sourceObservations![0],
      specification: "Unresolved/unreadable",
      description: "Posts",
      sourceFacts: [],
    },
    {
      ...data.sourceObservations![0],
      description: "Elevation views",
      specification: "Three views",
      itemRole: "Document observation",
    },
  ];
  data.suggestions = [];
  expect(validateAnalysis(data, ["plan"]).suggestions).toHaveLength(0);
});
it("source observation labour hours are never accepted as measured or inferred hours", () => {
  const data = deckTakeoffFixture();
  data.sourceObservations = [
    {
      ...data.sourceObservations![0],
      description: "Deck framing labour",
      specification: "Install specified deck framing",
      destination: "Labour",
      quantity: 24,
      quantityMethod: "Calculated",
      calculationBasis: "Productivity assumption",
    },
  ];
  data.suggestions = [
    { ...data.sourceObservations[0], itemRole: "Construction item" },
  ];
  const prepared = validateAnalysis(data, ["plan"]);
  expect(prepared.sourceObservations![0].quantity).toBeNull();
  expect(prepared.suggestions[0]).toMatchObject({
    quantity: null,
    unit: "hours",
  });
});

it("promotes a readable component specification from a dimension record without using spacing as purchase quantity", () => {
  const data = deckTakeoffFixture();
  data.suggestions = [];
  data.sourceObservations = [];
  data.dimensions = [
    {
      ...deckTakeoffFixture().sourceObservations![2],
      description: "Joist spacing",
      quantity: 16,
      unit: "inches",
      quantityMethod: "Written",
      specification: "2x6 PT joists @ 16 in. O.C.",
      sourceFacts: ["Readable 16 in. O.C. spacing; joist count not shown"],
    },
  ];
  const prepared = validateAnalysis(data, ["plan"]);
  expect(prepared.dimensions![0].quantity).toBe(16);
  expect(prepared.suggestions[0]).toMatchObject({
    category: "Joists",
    quantity: null,
    unit: "",
    specification: "2x6 PT joists @ 16 in. O.C.",
  });
  expect(prepareConstructionAnalysis(prepared)).toEqual(prepared);
});
it("even metadata containing a construction noun must stay source-only", () => {
  const data = deckTakeoffFixture();
  data.suggestions = [];
  data.sourceObservations = [
    {
      ...data.sourceObservations![0],
      description: "Footing detail identifier",
      specification: "Detail F1",
      itemRole: "Document observation",
    },
  ];
  expect(validateAnalysis(data, ["plan"]).suggestions).toHaveLength(0);
});

it("known component categorization can promote a supported member specification without guessing from a vague label", () => {
  const data = deckTakeoffFixture();
  data.suggestions = [];
  data.sourceObservations = [
    {
      ...data.sourceObservations![1],
      description: "Structural member",
      category: "Beams",
      quantity: null,
      quantityMethod: "Unknown",
    },
  ];
  expect(validateAnalysis(data, ["plan"]).suggestions[0]).toMatchObject({
    category: "Beams",
    quantity: null,
    specification: "3-ply 2x10 PT beams",
  });
});
it("valid detail-source and page identifiers survive validation in observations and promoted candidates", () => {
  const data = deckTakeoffFixture();
  data.sourceObservations![0].sourceDetailView = 1;
  const region = {
    page: 1,
    rotation: 90 as const,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    pageWidth: 2592,
    pageHeight: 1728,
    dpi: 250,
    pixelWidth: 348,
    pixelHeight: 348,
    data: "synthetic source detail",
  };
  const result = validateAnalysis(
    data,
    ["plan"],
    [
      {
        id: "plan",
        name: "plan.pdf",
        type: "application/pdf",
        data: "original synthetic PDF",
        detailRegions: [region],
      },
    ],
  );
  expect(result.sourceObservations![0]).toMatchObject({
    page: 1,
    sourceDetailView: 1,
    confidence: "High",
    classification: "Plan fact",
  });
  expect(result.suggestions[0]).toMatchObject({
    page: 1,
    sourceDetailView: 1,
    confidence: "High",
    sourceFacts: data.sourceObservations![0].sourceFacts,
  });
  region.page = 2;
  expect(() =>
    validateAnalysis(
      data,
      ["plan"],
      [
        {
          id: "plan",
          name: "plan.pdf",
          type: "application/pdf",
          data: "original",
          detailRegions: [region],
        },
      ],
    ),
  ).toThrow();
});
it("contractor-only scope confirmation and malformed typed observations cannot come from the model", () => {
  const data = deckTakeoffFixture();
  Object.assign(data.sourceObservations![0], { scopeVerified: true });
  expect(() => validateAnalysis(data, ["plan"])).toThrow();
  delete (data.sourceObservations![0] as unknown as Record<string, unknown>)
    .scopeVerified;
  Object.assign(data.sourceObservations![0], {
    supportBasis: "Definitely included",
  });
  expect(() => validateAnalysis(data, ["plan"])).toThrow();
});

it("a trade suggestion mentioning a subcontractor does not establish explicit by-others work", () => {
  const data = deckTakeoffFixture();
  data.sourceObservations = [];
  data.suggestions = [
    {
      ...deckTakeoffFixture().sourceObservations![0],
      destination: "Subcontractor",
      itemRole: "Construction item",
      description: "Electrical rough-in",
      category: "Electrical",
      specification: "",
      subcontractorBasis: "Separate trade suggestion",
      sourceFacts: [
        "Potential electrical subcontractor suggested; drawing only shows electrical rough-in",
      ],
    },
  ];
  expect(validateAnalysis(data, ["plan"]).suggestions[0]).toMatchObject({
    destination: "Labour",
    quantity: null,
    subcontractorBasis: "Not established",
  });
});
