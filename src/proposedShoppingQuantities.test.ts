import { expect, it } from "vitest";
import { seed, takeoffToLine, type TakeoffItem } from "./model";
import { materialTakeoffProposal, prepareDeckTakeoff } from "./deckTakeoff";
import { purchasingGroups } from "./purchasingGroups";
import { approvedPurchasingGroups } from "./materialShoppingList";
import type { MaterialInput } from "../shared/materialInputs";
const fact = (
  field: MaterialInput["field"],
  value: number,
  unit: MaterialInput["unit"],
): MaterialInput => ({
  field,
  value,
  unit,
  page: 2,
  evidence: `D1 explicitly specifies ${field}: ${value} ${unit}`,
  readable: true,
});
const base: TakeoffItem = {
  id: "joists",
  description: "Deck joists",
  specification: '2x6 PT at 16" O.C.',
  documentId: "synthetic",
  sourceDocumentName: "Synthetic deck.pdf",
  page: 2,
  location: "Deck D1",
  quantity: null,
  unit: "boards",
  notes: "New work",
  origin: "ai",
  destination: "Materials",
  status: "Proposed",
  confidence: "High",
  workScope: "New work",
  included: true,
  materialInputs: [
    fact("layoutLength", 16, "ft"),
    fact("memberLength", 10, "ft"),
    fact("layoutClear", 1, "option"),
    fact("edgeIncluded", 1, "option"),
  ],
};
const quote = (items: TakeoffItem[]) => ({
  ...seed().quotes[0],
  status: "Draft" as const,
  takeoff: items,
});
it("shows 13 proposed joists with source page and units before approval, never converts them", () => {
  const q = prepareDeckTakeoff(quote([base])),
    t = q.takeoff[0];
  expect(materialTakeoffProposal(t)).toMatchObject({
    quantity: 13,
    unit: "joists",
    purchase: null,
  });
  expect(materialTakeoffProposal(t).sources.join(" ")).toContain("page 2");
  expect(purchasingGroups(q, q.takeoff)[0]).toMatchObject({
    quantity: 13,
    unit: "joists",
  });
  expect(t.quantity).toBeNull();
  expect(t.status).toBe("Proposed");
  expect(approvedPurchasingGroups(q)).toEqual([]);
  expect(() => takeoffToLine(q, t, "Materials")).toThrow();
});
it("shows a supported purchase proposal only after stock and waste inputs exist", () => {
  const t = {
    ...base,
    materialInputs: [
      ...base.materialInputs!,
      fact("stock", 12, "ft"),
      fact("waste", 10, "%"),
    ],
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(materialTakeoffProposal(q.takeoff[0])).toMatchObject({
    quantity: 13,
    purchase: 15,
    purchaseUnit: "boards",
  });
  expect(purchasingGroups(q, q.takeoff)[0]).toMatchObject({
    quantity: 15,
    unit: "boards",
  });
  expect(approvedPurchasingGroups(q)).toEqual([]);
});
it("reopens populated saved unverified calculator inputs as proposals, preserving manual corrections", () => {
  const t = {
    ...base,
    materialInputs: undefined,
    calculation: {
      kind: "joists",
      inputs: { length: 20, spacing: 16, member: 10, stock: 12, waste: 0 },
      geometryConfirmed: true,
      verified: false,
    },
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(materialTakeoffProposal(q.takeoff[0])).toMatchObject({
    quantity: 16,
    purchase: 16,
  });
  expect(q.takeoff[0].calculation?.inputs.length).toBe(20);
  expect(prepareDeckTakeoff(q)).toEqual(q);
});
it("does not refill intentionally blank saved fields from original drawing values", () => {
  const t = {
    ...base,
    calculation: {
      kind: "joists",
      inputs: { length: null, spacing: 16 },
      geometryConfirmed: true,
      verified: false,
    },
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(q.takeoff[0].calculation?.inputs.length).toBeNull();
  expect(materialTakeoffProposal(q.takeoff[0]).quantity).toBeNull();
});
it("migrates explicit semicolon-separated legacy roles with provenance, not unrelated dimensions", () => {
  const t = {
    ...base,
    materialInputs: undefined,
    sourceFacts: [
      "Deck D1: Layout length: 16 ft; Member length: 10 ft; Stock length: 12 ft; Waste allowance: 0%",
    ],
    calculation: {
      kind: "joists",
      inputs: {},
      geometryConfirmed: true,
      verified: false,
    },
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(q.takeoff[0].calculation?.inputs).toMatchObject({
    length: 16,
    member: 10,
    spacing: 16,
    stock: 12,
    waste: 0,
  });
  expect(materialTakeoffProposal(q.takeoff[0]).purchase).toBe(13);
  expect(q.takeoff[0].calculation?.inputSources?.length).toContain("page 2");
  const unrelated = {
    ...base,
    materialInputs: undefined,
    sourceFacts: ["House width 16 ft; dimension near joists 10 ft"],
  };
  expect(materialTakeoffProposal(unrelated).quantity).toBeNull();
});
it("requires actual layout boundaries even with spacing and length", () => {
  const t = {
    ...base,
    materialInputs: base.materialInputs!.filter(
      (f) => !["layoutClear", "edgeIncluded"].includes(f.field),
    ),
  };
  expect(materialTakeoffProposal(t).quantity).toBeNull();
  expect(materialTakeoffProposal(t).missing.join(" ")).toContain(
    "layout boundary and openings, required edge members",
  );
});
it("derives hardware only from explicit connection counts and pieces per connection", () => {
  const t = {
    ...base,
    id: "h",
    description: "Simpson LUS26 hangers",
    specification: "Simpson LUS26",
    materialInputs: [
      fact("connections", 13, "each"),
      fact("piecesPerConnection", 1, "each"),
    ],
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(purchasingGroups(q, q.takeoff)[0]).toMatchObject({
    quantity: 13,
    unit: "each",
  });
  expect(
    materialTakeoffProposal({
      ...t,
      materialInputs: [fact("connections", 13, "each")],
    }).quantity,
  ).toBeNull();
});
it("does not turn beam runs into boards without individual lengths and arrangements", () => {
  const t = {
    ...base,
    description: "Beam B1",
    specification: "3PLY 2X10 PT",
    materialInputs: undefined,
    calculation: { kind: "beam-runs", inputs: { runs: 3 }, verified: false },
  };
  const q = quote([t]);
  expect(purchasingGroups(q, q.takeoff)[0]).toMatchObject({
    quantity: 3,
    unit: "runs",
  });
  expect(materialTakeoffProposal(t).purchase).toBeNull();
});
it("presents explicit repeated views once, never sums quantities or erases evidence", () => {
  const a = {
    ...base,
    sourceFacts: ["Repeated view of the same physical assembly: D1 joists"],
  };
  const b = {
    ...a,
    id: "repeat",
    page: 3,
    sourceFacts: [...a.sourceFacts, "Elevation source page 3"],
  };
  const q = prepareDeckTakeoff(quote([a, b]));
  const before = structuredClone(q);
  expect(purchasingGroups(q, q.takeoff)).toHaveLength(1);
  expect(purchasingGroups(q, q.takeoff)[0]).toMatchObject({
    quantity: 13,
    unit: "joists",
  });
  expect(q).toEqual(before);
  expect(purchasingGroups(q, q.takeoff)[0].items).toHaveLength(2);
});
it("does not combine distinct assemblies or conflicting counts", () => {
  const q = prepareDeckTakeoff(
    quote([
      base,
      {
        ...base,
        id: "other",
        location: "Side deck",
        materialInputs: base.materialInputs!.map((f) =>
          f.field === "layoutLength" ? { ...f, value: 20 } : f,
        ),
      },
    ]),
  );
  expect(purchasingGroups(q, q.takeoff)[0].quantity).toBeNull();
  const t = {
    ...base,
    materialInputs: [...base.materialInputs!, fact("layoutLength", 20, "ft")],
  };
  expect(materialTakeoffProposal(t).quantity).toBeNull();
});
it("removes existing, by-others and general notes from purchasable groups", () => {
  const items = [
    { ...base, workScope: "Existing work to remain" as const },
    {
      ...base,
      id: "others",
      workScope: "By others / excluded" as const,
      included: false,
    },
    {
      ...base,
      id: "notes",
      description: "General construction notes",
      quantity: null,
    },
  ];
  const q = quote(items);
  expect(purchasingGroups(q, items)).toEqual([]);
});
it("retains written support counts through fresh initialization and reopening without estimating concrete", () => {
  const t: TakeoffItem = {
    ...base,
    description: "New concrete footing / pier assemblies",
    specification: "12 inch pier on 24 inch footing",
    quantity: 4,
    unit: "each",
    quantityMethod: "Counted",
    materialInputs: [fact("diameter", 12, "in"), fact("depth", 48, "in")],
    sourceFacts: ["Four new footing / pier assemblies counted at Deck D1"],
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(q.takeoff[0].quantity).toBeNull();
  expect(q.takeoff[0].calculation?.inputs.count).toBe(4);
  expect(materialTakeoffProposal(q.takeoff[0])).toMatchObject({
    quantity: 4,
    unit: "assemblies",
    purchase: null,
  });
  expect(prepareDeckTakeoff(q)).toEqual(q);
  const ambiguous = { ...t, quantityMethod: "Unknown" as const };
  expect(
    materialTakeoffProposal(prepareDeckTakeoff(quote([ambiguous])).takeoff[0])
      .quantity,
  ).toBeNull();
});
it("legacy complete construction evidence resolves labelled geometry and edge conditions", () => {
  const t = {
    ...base,
    specification: "2x6 PT",
    materialInputs: undefined,
    sourceFacts: [
      "New work Deck D1 2x6 PT layout length: 16 ft; spacing inches: 16; joist length: 12 ft; stock length: 12 ft; waste allowance: 0%; uniform layout; both ends included; no openings",
    ],
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(materialTakeoffProposal(q.takeoff[0])).toMatchObject({
    quantity: 13,
    unit: "joists",
    purchase: 13,
  });
  const bad = {
    ...t,
    sourceFacts: [t.sourceFacts[0].replace("no openings", "openings unknown")],
  };
  expect(
    materialTakeoffProposal(prepareDeckTakeoff(quote([bad])).takeoff[0])
      .quantity,
  ).toBeNull();
});
it("never treats a nonuniform layout as a regular joist layout", () => {
  const t = {
    ...base,
    specification: "2x6 PT",
    materialInputs: undefined,
    sourceFacts: [
      "New work Deck D1 2x6 PT layout length: 16 ft; spacing inches: 16; nonuniform layout; both ends included; no openings",
    ],
  };
  expect(
    materialTakeoffProposal(prepareDeckTakeoff(quote([t])).takeoff[0]).quantity,
  ).toBeNull();
});
it("keeps same-spec alternatives unresolved even when observations say repeated assembly", () => {
  const a = {
    ...base,
    alternativeGroup: "Layout choice",
    alternativeOption: "A",
    sourceFacts: ["Same physical assembly D1"],
  };
  const b = { ...a, id: "alternative", alternativeOption: "B" };
  const q = prepareDeckTakeoff(quote([a, b]));
  expect(purchasingGroups(q, q.takeoff)[0].quantity).toBeNull();
});
it("retains an explicit counted joist observation through calculator initialization, independently of purchase inputs", () => {
  const t: TakeoffItem = {
    ...base,
    quantity: 13,
    unit: "joists",
    quantityMethod: "Counted",
    materialInputs: undefined,
    sourceFacts: ["New work: 13 individually identified joists in Deck D1"],
    assumptions: [],
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(q.takeoff[0].quantity).toBeNull();
  expect(materialTakeoffProposal(q.takeoff[0])).toMatchObject({
    quantity: 13,
    unit: "joists",
    purchase: null,
  });
  expect(purchasingGroups(q, q.takeoff)[0].quantity).toBe(13);
  expect(prepareDeckTakeoff(q)).toEqual(q);
});
it("retains supported quantities for separate source observations without summing their counts", () => {
  const q = prepareDeckTakeoff(
    quote([base, { ...base, id: "side", location: "Side deck" }]),
  );
  const group = purchasingGroups(q, q.takeoff)[0];
  expect(group.quantity).toBeNull();
  expect(group.observations.map((o) => o.quantity)).toEqual([13, 13]);
});
it("does not replace intentionally cleared calculator measurements with drawing facts", () => {
  const t: TakeoffItem = {
    ...base,
    calculation: {
      kind: "joists",
      verified: false,
      inputs: { length: null, spacing: 16 },
    },
  };
  const q = prepareDeckTakeoff(quote([t]));
  expect(q.takeoff[0].calculation?.inputs.length).toBeNull();
  expect(materialTakeoffProposal(q.takeoff[0]).quantity).toBeNull();
});
it("does not hide a conflict between a counted joist observation and the layout calculation", () => {
  const t = {
    ...base,
    materialInputs: [...base.materialInputs!, fact("count", 14, "each")],
  };
  const q = prepareDeckTakeoff(quote([t]));
  const proposal = materialTakeoffProposal(q.takeoff[0]);
  expect(proposal.quantity).toBeNull();
  expect(proposal.purchase).toBeNull();
  expect(proposal.missing.join(" ")).toContain(
    "Counted observation (14 joists) conflicts with the layout calculation (13 joists)",
  );
});
it("never displays a saved erroneous beam-run calculation as a ledger or flashing quantity", () => {
  const t: TakeoffItem = {
    ...base,
    description: "2x6 ledger board with aluminum flashing",
    category: "Beams",
    calculation: {
      kind: "beam-runs",
      verified: false,
      inputs: { runs: 3, plies1: 3 },
    },
  };
  expect(materialTakeoffProposal(t)).toMatchObject({
    quantity: null,
    purchase: null,
  });
  expect(t.calculation?.inputs.runs).toBe(3);
});
