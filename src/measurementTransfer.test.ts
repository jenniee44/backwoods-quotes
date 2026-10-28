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
