import { expect, it } from "vitest";
import { analysisFixture } from "../shared/analysis.fixture";
import { prepareConstructionAnalysis } from "../shared/takeoff";
import { addAnalysisSuggestions } from "./planAnalysis";
import { seed } from "./model";
import { materialTakeoffProposal } from "./deckTakeoff";
const fixture = () => {
  const r = analysisFixture("synthetic");
  const material = {
    ...r.suggestions[0],
    description: "Deck joists",
    specification: '2x6 PT at 16" O.C.',
    location: "Deck D1",
    destination: "Materials" as const,
    quantity: null,
    unit: "joists",
    quantityMethod: "Unknown" as const,
    assumptions: [],
    warnings: [],
    confidence: "High" as const,
    itemRole: "Construction item" as const,
    sourceFacts: ["New work Deck D1 joists"],
  };
  r.suggestions = [material];
  r.dimensions = [
    {
      ...material,
      itemRole: "Supporting evidence",
      materialInputs: [
        {
          field: "layoutLength",
          value: 192,
          unit: "in",
          page: 1,
          evidence: "Deck D1 joist spacing axis 16 ft",
          readable: true,
        },
        {
          field: "layoutClear",
          value: 1,
          unit: "option",
          page: 1,
          evidence: "Regular layout without openings",
          readable: true,
        },
        {
          field: "edgeIncluded",
          value: 1,
          unit: "option",
          page: 1,
          evidence: "Both edge joists included",
          readable: true,
        },
      ],
    },
  ];
  return r;
};
it("transfers explicitly associated dimension inputs through normalization into a proposed joist count", () => {
  const r = fixture(),
    before = structuredClone(r);
  const normalized = prepareConstructionAnalysis(r);
  expect(normalized.suggestions[0].materialInputs?.[0].value).toBe(192);
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [];
  q.documents = [
    { id: "synthetic", name: "Synthetic.pdf" },
  ] as typeof q.documents;
  const next = addAnalysisSuggestions(q, r);
  expect(materialTakeoffProposal(next.takeoff[0])).toMatchObject({
    quantity: 13,
    unit: "joists",
    purchase: null,
  });
  expect(next.takeoff[0].status).toBe("Proposed");
  expect(materialTakeoffProposal(next.takeoff[0]).sources.join(" ")).toContain(
    "page 1",
  );
  expect(r).toEqual(before);
});
it.each(["page", "location", "scope", "specification"])(
  "never borrows dimensions from another %s",
  (field) => {
    const r = fixture();
    if (field === "page") r.dimensions![0].page = 2;
    if (field === "location") r.dimensions![0].location = "Other deck";
    if (field === "scope") r.dimensions![0].notes = "Existing work to remain";
    if (field === "specification") r.dimensions![0].specification = "2x8 PT";
    expect(
      prepareConstructionAnalysis(r).suggestions.find(
        (t) => t.description === "Deck joists",
      )?.materialInputs,
    ).toBeUndefined();
  },
);
it("joins an explicitly identified joist layout to its own dimension record without requiring lumber text on the dimension", () => {
  const r = fixture();
  r.suggestions[0].sourceFacts = ["New work Joist layout J1"];
  r.dimensions![0].sourceFacts = ["Joist layout J1"];
  r.dimensions![0].description = "Written perpendicular layout dimension";
  r.dimensions![0].specification = "16 ft";
  r.dimensions![0].location = "Dimension extension line J1";
  r.dimensions![0].materialInputs![0].evidence =
    "Joist layout J1: 16 ft perpendicular to joists";
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [];
  q.documents = [
    { id: "synthetic", name: "Synthetic.pdf" },
  ] as typeof q.documents;
  expect(
    materialTakeoffProposal(addAnalysisSuggestions(q, r).takeoff[0]),
  ).toMatchObject({ quantity: 13, unit: "joists", purchase: null });
});
it.each([
  "ambiguous",
  "overall",
  "duplicate-layout",
  "other-page",
  "missing-axis",
])("does not use a %s association for joist arithmetic", (failure) => {
  const r = fixture();
  r.suggestions[0].sourceFacts = ["New work Joist layout J1"];
  r.dimensions![0].sourceFacts = ["Joist layout J1"];
  r.dimensions![0].specification = "16 ft";
  r.dimensions![0].location = "Dimension string";
  r.dimensions![0].materialInputs![0].evidence =
    "Joist layout J1: 16 ft perpendicular to joists";
  if (failure === "ambiguous")
    r.dimensions![0].calculationBasis = "Exact assembly association uncertain";
  if (failure === "overall") {
    r.dimensions![0].sourceFacts = ["24'-3\" overall dimension"];
    r.dimensions![0].materialInputs![0].value = 24.25;
  }
  if (failure === "duplicate-layout")
    r.suggestions.push({
      ...r.suggestions[0],
      description: "Other physical assembly",
    });
  if (failure === "other-page") r.dimensions![0].page = 2;
  if (failure === "missing-axis")
    r.dimensions![0].materialInputs![0].evidence =
      "Overall horizontal dimension";
  const result = prepareConstructionAnalysis(r);
  expect(
    result.suggestions[0].materialInputs?.some(
      (f) => f.field === "layoutLength",
    ),
  ).not.toBe(true);
});
it("shows proposed joist arithmetic before approval when geometry is explicitly supported, with no invented stock or waste", () => {
  const r = fixture(),
    q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [];
  q.documents = [
    { id: "synthetic", name: "Synthetic.pdf" },
  ] as typeof q.documents;
  const next = addAnalysisSuggestions(q, r),
    t = next.takeoff[0];
  const proposal = materialTakeoffProposal(t);
  expect(proposal.quantity).toBe(13);
  expect(proposal.formula).toContain("ceil(16 ft × 12 / 16 in) + 1");
  expect(proposal.purchase).toBeNull();
  expect(proposal.missing.join(" ")).toContain("stock");
  expect(t.calculation?.inputs.waste).toBeUndefined();
  expect(t.status).toBe("Proposed");
});
