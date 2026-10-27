import { describe, it, expect } from "vitest";
import {
  materialTakeoffProposal,
  proposedMaterialRecipe,
  prepareDeckTakeoff,
  supportedMaterialInputs,
  applyTakeoffPreferences,
} from "./deckTakeoff";
import { seed, type TakeoffItem, takeoffToLine } from "./model";
import {
  type MaterialInput,
  validMaterialInputs,
  materialInputIdentity,
} from "../shared/materialInputs";
import { calculateMaterial } from "../shared/materialCalculators";
import {
  approveTakeoff,
  reviewTakeoff,
  addAnalysisSuggestions,
} from "./planAnalysis";
import { approveSummaryMaterials } from "./materialsSummary";
import { prepareConstructionAnalysis } from "../shared/takeoff";
import { analysisFixture } from "../shared/analysis.fixture";
import { approvedPurchasingGroups } from "./materialShoppingList";
import { overlapKey, unresolvedOverlaps } from "./takeoffOverlap";
import { customerDocument } from "./customerDocument";
const base: TakeoffItem = {
  id: "synthetic-deck",
  description: "Deck joists",
  specification: "2x8 PT at 16 in OC",
  quantity: null,
  unit: "boards",
  documentId: "synthetic",
  sourceDocumentName: "Synthetic construction plan",
  page: 1,
  notes: "New work",
  origin: "ai",
  destination: "Materials",
  category: "Joists",
  status: "Proposed",
  confidence: "High",
  classification: "Contractor input required",
  quantityMethod: "Unknown",
  included: true,
  workScope: "New work",
  location: "Deck D1",
  sourceFacts: ["Joist layout: D1; new rectangular deck"],
};
const input = (
  field: MaterialInput["field"],
  value: number,
  unit: MaterialInput["unit"],
): MaterialInput => ({
  field,
  value,
  unit,
  page: 1,
  evidence: `Drawing explicitly identifies ${field}: ${value} ${unit} for D1`,
  readable: true,
});
const geometry = [
  input("layoutLength", 16, "ft"),
  input("spacing", 16, "in"),
  input("memberLength", 10, "ft"),
  input("edgeIncluded", 1, "option"),
  input("layoutClear", 1, "option"),
];
describe("reconstructed automatic deck takeoff", () => {
  it("prepares 13 joists without approving or inventing purchase stock", () => {
    const t = { ...base, materialInputs: geometry },
      r = proposedMaterialRecipe(t)!;
    expect(r.inputs).toMatchObject({ length: 16, spacing: 16, member: 10 });
    expect(r.verified).toBe(false);
    expect(materialTakeoffProposal(t)).toMatchObject({
      quantity: 13,
      unit: "joists",
      purchase: null,
    });
    expect(calculateMaterial(r).quantity).toBeNull();
    expect(() => reviewTakeoff({ ...t, calculation: r })).toThrow();
  });
  it("preserves known dimensions while requiring explicit layout boundary/edge confirmation", () => {
    const t = {
        ...base,
        materialInputs: geometry.filter(
          (f) => !["edgeIncluded", "layoutClear"].includes(f.field),
        ),
      },
      r = proposedMaterialRecipe(t)!;
    expect(r.inputs.length).toBe(16);
    expect(r.geometryConfirmed).toBe(false);
    expect(materialTakeoffProposal(t).quantity).toBeNull();
    const complete = {
      ...r,
      inputs: { ...r.inputs, stock: 12, waste: 0 },
      verified: true,
    };
    expect(calculateMaterial(complete).quantity).toBeNull();
    expect(
      calculateMaterial({ ...complete, geometryConfirmed: true }).quantity,
    ).toBe(13);
    expect(
      materialTakeoffProposal({
        ...t,
        description: "Decking",
        materialInputs: [
          input("layoutLength", 16, "ft"),
          input("layoutWidth", 10, "ft"),
        ],
      }).quantity,
    ).toBeNull();
  });
  it("shows 15 boards provisionally with explicit stock and 10 percent waste, never approves suggestions", () => {
    const t = {
      ...base,
      materialInputs: [
        ...geometry,
        input("stock", 12, "ft"),
        input("waste", 10, "%"),
      ],
    };
    expect(materialTakeoffProposal(t)).toMatchObject({
      quantity: 13,
      purchase: 15,
      purchaseUnit: "boards",
    });
    const q = seed().quotes[0];
    q.status = "Draft";
    q.takeoff = [{ ...t, calculation: proposedMaterialRecipe(t) }];
    expect(() => approveSummaryMaterials(q, [t.id], true)).toThrow();
  });
  it.each([
    [
      "Joist hangers",
      "Simpson LUS26",
      [
        input("connections", 13, "each"),
        input("piecesPerConnection", 1, "each"),
      ],
      13,
      "each",
    ],
    [
      "Ledger screws",
      "Specified fastener",
      [
        input("connections", 8, "each"),
        input("piecesPerConnection", 2, "each"),
      ],
      16,
      "each",
    ],
    ["Posts", "6x6 PT", [input("count", 4, "each")], 4, "posts"],
    [
      "Railing",
      "Specified aluminum guard",
      [input("linearLength", 36, "ft")],
      36,
      "linear ft",
    ],
    [
      "Stair tread boards",
      "PT tread stock",
      [input("count", 5, "each"), input("pieces", 2, "each")],
      10,
      "cut pieces",
    ],
    [
      "Stair stringers",
      "Specified stringer lumber",
      [
        input("layoutWidth", 4, "ft"),
        input("spacing", 16, "in"),
        input("edgeIncluded", 1, "option"),
        input("layoutClear", 1, "option"),
      ],
      4,
      "stringers",
    ],
  ] as const)(
    "prepares %s from material-specific evidence",
    (description, specification, materialInputs, quantity, unit) => {
      expect(
        materialTakeoffProposal({
          ...base,
          description,
          specification,
          materialInputs: [...materialInputs],
        }),
      ).toMatchObject({ quantity, unit, purchase: null });
    },
  );
  it("distinguishes footing assemblies from round/rectangular concrete volume", () => {
    const materialInputs = [
      input("count", 4, "each"),
      input("diameter", 12, "in"),
      input("depth", 48, "in"),
    ];
    const r = materialTakeoffProposal({
      ...base,
      description: "Concrete supply volume",
      specification: "12 inch × 48 inch cylinders",
      materialInputs,
    });
    expect(r.unit).toBe("cu yd");
    expect(r.quantity).toBeCloseTo((4 * Math.PI * 0.5 ** 2 * 4) / 27);
    expect(r.purchase).toBeNull();
    expect(
      materialTakeoffProposal({
        ...base,
        description: "Concrete footing assemblies",
        materialInputs,
      }),
    ).toMatchObject({ quantity: 4, unit: "assemblies" });
    expect(
      materialTakeoffProposal({
        ...base,
        description: "Concrete supply volume",
        materialInputs: [
          input("count", 2, "each"),
          input("padLength", 24, "in"),
          input("padWidth", 24, "in"),
          input("depth", 12, "in"),
        ],
      }).quantity,
    ).toBeCloseTo(8 / 27);
  });
  it("calculates decking area/rows only with actual width, direction, gaps and layout; nominal sizes are not actual widths", () => {
    const materialInputs = [
      input("layoutLength", 12, "ft"),
      input("layoutWidth", 10, "ft"),
      input("layoutClear", 1, "option"),
    ];
    const t = {
      ...base,
      description: "Decking boards",
      specification: "2x6 PT",
      materialInputs,
    };
    expect(materialTakeoffProposal(t)).toMatchObject({
      quantity: 120,
      unit: "sq ft",
      purchase: null,
    });
    const complete = {
      ...t,
      materialInputs: [
        ...materialInputs,
        input("boardWidth", 5.5, "in"),
        input("gap", 0.125, "in"),
        input("direction", 0, "option"),
        input("pieces", 1, "each"),
        input("stock", 12, "ft"),
        input("kerf", 0.125, "in"),
        input("waste", 10, "%"),
      ],
    };
    expect(materialTakeoffProposal(complete)).toMatchObject({
      quantity: 22,
      unit: "cut pieces",
      purchase: 25,
    });
  });
  it.each(["Ledger", "Rim joist", "Blocking", "Fascia"])(
    "calculates %s from explicit equal cut lengths and safe stock inputs",
    (description) => {
      const t = {
        ...base,
        description,
        materialInputs: [
          input("count", 6, "each"),
          input("memberLength", 4, "ft"),
          input("stock", 12, "ft"),
          input("kerf", 0.125, "in"),
          input("waste", 0, "%"),
        ],
      };
      expect(materialTakeoffProposal(t)).toMatchObject({
        quantity: 6,
        purchase: 3,
        purchaseUnit: "boards",
      });
      expect(
        materialTakeoffProposal({
          ...t,
          materialInputs: t.materialInputs.map((f) =>
            f.field === "stock" ? { ...f, value: 3 } : f,
          ),
        }).purchase,
      ).toBeNull();
    },
  );
  it("retains conflicts/unreadable/wrong-unit inputs without summing repeated measurements", () => {
    const t = {
      ...base,
      materialInputs: [...geometry, input("layoutLength", 20, "ft")],
    };
    expect(materialTakeoffProposal(t).quantity).toBeNull();
    expect(supportedMaterialInputs(t).conflicts).toContain("layoutLength");
    for (const bad of [
      { ...geometry[0], readable: false },
      { ...geometry[0], page: null },
      { ...geometry[0], unit: "each" as const },
      { ...geometry[0], evidence: "Unknown length" },
    ])
      expect(
        materialTakeoffProposal({
          ...base,
          materialInputs: [bad, ...geometry.slice(1)],
        }).quantity,
      ).toBeNull();
    expect(
      materialTakeoffProposal({
        ...base,
        materialInputs: [
          ...geometry,
          ...geometry.map((f) => ({ ...f, page: 2 })),
        ],
      }).quantity,
    ).toBe(13);
    expect(materialInputIdentity([input("memberLength", 12, "ft")])).toBe(
      materialInputIdentity([input("memberLength", 144, "in")]),
    );
  });
  it("preserves manual entries, intentional blanks, verified recipes and estimate lines on repeated reopen", () => {
    const legacy = [
      { ...base, id: "old-a", materialInputs: undefined },
      { ...base, id: "old-b", materialInputs: undefined },
    ];
    const legacyKey = JSON.stringify(
      legacy.map((t) => [
        t.id,
        t.description,
        t.specification,
        t.location,
        t.workScope,
        t.supportBasis,
        t.subcontractorBasis,
        t.quantity,
        t.unit,
        t.alternativeGroup,
        t.alternativeOption,
        t.calculation,
        t.stockLength ?? null,
        t.documentId,
        t.page,
        t.sourceFacts,
        t.notes,
      ]),
    );
    expect(overlapKey(legacy[0], legacy[1])).toBe(legacyKey);
    const legacyQuote = seed().quotes[0];
    legacyQuote.takeoff = legacy.map((t) => ({
      ...t,
      overlapReviews: [legacyKey],
    }));
    expect(
      unresolvedOverlaps(legacyQuote, legacyQuote.takeoff[0]),
    ).toHaveLength(0);
    const q = seed().quotes[0];
    q.status = "Draft";
    const t = {
      ...base,
      materialInputs: geometry,
      calculation: {
        kind: "joists",
        verified: false,
        inputs: { length: 20, spacing: null, member: 14 },
      },
    };
    q.takeoff = [
      t,
      {
        ...t,
        id: "verified",
        calculation: { ...t.calculation, verified: true },
      },
      {
        ...base,
        id: "manual",
        quantity: 99,
        calculationBasis: "Manual purchase quantity entered by contractor",
        materialInputs: geometry,
      },
    ];
    const next = prepareDeckTakeoff(q);
    expect(next.takeoff[0].calculation?.inputs).toMatchObject(
      t.calculation.inputs,
    );
    expect(next.takeoff[1]).toEqual(q.takeoff[1]);
    expect(next.takeoff[2]).toEqual(q.takeoff[2]);
    expect(next.lines).toEqual(q.lines);
    expect(prepareDeckTakeoff(next)).toEqual(next);
  });
  it.each([
    "Existing work to remain",
    "Existing work to remove or modify",
    "By others / excluded",
    "Requires scope confirmation",
  ] as const)("does not prepare purchases for %s", (workScope) => {
    const t = { ...base, workScope, materialInputs: geometry };
    if (workScope === "Requires scope confirmation") {
      expect(proposedMaterialRecipe(t)?.verified).toBe(false);
      expect(materialTakeoffProposal(t).quantity).toBe(13);
    } else expect(proposedMaterialRecipe(t)).toBeUndefined();
    expect(materialTakeoffProposal(t).purchase).toBeNull();
  });
  it("fresh analysis retains input/page provenance and consolidates clear repeat views without double counts", () => {
    const q = seed().quotes[0];
    q.status = "Draft";
    q.takeoff = [];
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
    result.dimensions = [];
    result.suggestions = [
      { ...base, materialInputs: geometry },
      {
        ...base,
        page: 2,
        materialInputs: geometry.map((f) => ({ ...f, page: 2 })),
      },
    ];
    const next = addAnalysisSuggestions(q, result);
    expect(next.takeoff).toHaveLength(1);
    expect(next.takeoff[0].materialInputs).toHaveLength(10);
    expect(next.takeoff[0].calculation?.inputs.length).toBe(16);
    expect(materialTakeoffProposal(next.takeoff[0]).quantity).toBe(13);
    expect(next.takeoff[0].quantity).toBeNull();
  });
  it("keeps conflicting measurements, different assemblies and foundation alternatives separate", () => {
    const result = analysisFixture("synthetic");
    result.dimensions = [];
    result.suggestions = [
      { ...base, materialInputs: geometry },
      { ...base, page: 2, materialInputs: [input("layoutLength", 20, "ft")] },
      { ...base, location: "Deck D2", materialInputs: geometry },
    ];
    expect(prepareConstructionAnalysis(result).suggestions).toHaveLength(3);
  });
  it("transfers only verified approved materials once, retaining manual lines and private provenance", () => {
    const q = seed().quotes[0];
    q.status = "Draft";
    const t = {
      ...base,
      materialInputs: [
        ...geometry,
        input("stock", 12, "ft"),
        input("waste", 0, "%"),
      ],
    };
    const calculation = { ...proposedMaterialRecipe(t)!, verified: true },
      reviewed = approveTakeoff(
        reviewTakeoff({
          ...t,
          calculation,
          quantity: 13,
          unit: "boards",
          quantityMethod: "Calculated",
        }),
      );
    q.takeoff = [reviewed];
    const next = takeoffToLine(q, reviewed, "Materials");
    expect(next.lines.slice(0, q.lines.length)).toEqual(q.lines);
    expect(next.lines.at(-1)?.quantity).toBe(13);
    expect(next.lines.at(-1)?.takeoffSource?.materialInputs).toEqual(
      t.materialInputs,
    );
    expect(() => takeoffToLine(next, next.takeoff[0], "Materials")).toThrow();
  });
  it("rejects malformed, privileged or oversized structured input metadata", () => {
    expect(validMaterialInputs(geometry)).toBe(true);
    expect(validMaterialInputs([{ ...geometry[0], verified: true }])).toBe(
      false,
    );
    expect(validMaterialInputs([{ ...geometry[0], value: Infinity }])).toBe(
      false,
    );
    expect(
      validMaterialInputs(Array.from({ length: 41 }, () => geometry[0])),
    ).toBe(false);
  });
  it("applies explicit quote stock/waste preferences only to never-entered unreviewed fields", () => {
    const q = seed().quotes[0];
    q.status = "Draft";
    const t = { ...base, materialInputs: geometry };
    q.takeoff = [
      t,
      {
        ...t,
        id: "manual",
        calculation: {
          kind: "joists",
          inputs: { length: 16, member: 10, stock: 16, waste: null },
          verified: false,
        },
      },
      { ...t, id: "reviewed", status: "Reviewed", reviewAcknowledged: true },
    ];
    const next = applyTakeoffPreferences(q, [8, 12, 16], 10);
    expect(next.takeoff[0].calculation?.inputs).toMatchObject({
      stock: 12,
      waste: 10,
    });
    expect(next.takeoff[0].calculation?.verified).toBe(false);
    expect(next.takeoff[0].quantity).toBeNull();
    expect(next.takeoff[1].calculation?.inputs).toMatchObject({
      stock: 16,
      waste: null,
    });
    expect(next.takeoff[2]).toEqual(q.takeoff[2]);
    expect(next.lines).toEqual(q.lines);
    expect(next.pricing).toEqual(q.pricing);
    expect(() => applyTakeoffPreferences(q, [0], 10)).toThrow();
    expect(() => applyTakeoffPreferences(q, [12], 101)).toThrow();
  });
  it("groups only approved, verified, explicitly separate assemblies by specification and stock length", () => {
    const q = seed().quotes[0];
    q.status = "Draft";
    const materialInputs = [
      ...geometry,
      input("stock", 12, "ft"),
      input("waste", 0, "%"),
    ];
    const t = {
      ...base,
      materialInputs,
      calculation: {
        ...proposedMaterialRecipe({ ...base, materialInputs })!,
        verified: true,
      },
      quantity: 13,
      unit: "boards",
      status: "Approved",
      reviewAcknowledged: true,
      conflictsVerified: true,
    } as TakeoffItem;
    q.takeoff = [
      t,
      {
        ...t,
        id: "second",
        description: "Deck joists D2",
        location: "Deck D2",
      },
      {
        ...t,
        id: "third",
        description: "Deck joists D3",
        location: "Deck D3",
        calculation: {
          ...t.calculation!,
          inputs: { ...t.calculation!.inputs, stock: 16 },
        },
      },
      {
        ...t,
        id: "not-approved",
        status: "Proposed",
        location: "Other deck",
        quantity: 99,
      },
    ];
    q.takeoff = q.takeoff.map((item) => ({
      ...item,
      overlapReviews: q.takeoff
        .filter((v) => v.id !== item.id)
        .map((v) => overlapKey(item, v)),
    }));
    const groups = approvedPurchasingGroups(q);
    expect(groups.find((g) => g.stock === 12)?.quantity).toBe(26);
    expect(groups.find((g) => g.stock === 16)?.quantity).toBe(13);
    expect(groups.flatMap((g) => g.sourceIds)).not.toContain("not-approved");
  });
  it("raw conflicting input evidence cannot be bypassed by a numeric quantity or reviewed status", () => {
    const t = {
      ...base,
      materialInputs: [...geometry, input("layoutLength", 20, "ft")],
      quantity: 13,
      unit: "boards",
    };
    expect(() => reviewTakeoff(t)).toThrow(/conflicting/);
    expect(() =>
      approveTakeoff({ ...t, status: "Reviewed", reviewAcknowledged: true }),
    ).toThrow(/conflicting/);
  });
  it("keeps structured inputs, internal evidence and stock/waste preferences out of customer documents", () => {
    const q = seed().quotes[0];
    q.takeoff = [
      {
        ...base,
        materialInputs: [
          { ...geometry[0], evidence: "PRIVATE INTERNAL DRAWING EVIDENCE" },
        ],
      },
    ];
    q.takeoffPreferences = { availableStock: [12, 16], waste: 17 };
    const customer = JSON.stringify(customerDocument(q));
    expect(customer).not.toContain("PRIVATE INTERNAL");
    expect(customer).not.toContain("materialInputs");
    expect(customer).not.toContain("takeoffPreferences");
  });
  it("does not design a combined pad/pier geometry or silently treat it as a simple volume", () => {
    const t = {
      ...base,
      description: "Concrete supply volume for combined pier and pad",
      materialInputs: [
        input("count", 4, "each"),
        input("diameter", 12, "in"),
        input("padLength", 24, "in"),
        input("padWidth", 24, "in"),
        input("depth", 48, "in"),
      ],
    };
    expect(proposedMaterialRecipe(t)).toBeUndefined();
    expect(materialTakeoffProposal(t).quantity).toBeNull();
    expect(materialTakeoffProposal(t).purchase).toBeNull();
  });
  it("uses associated labelled legacy measurements, preserving notation and page without measuring pixels", () => {
    const t = {
      ...base,
      sourceFacts: [
        "Layout length: 16 ft",
        "Joist spacing: 16 in",
        "Member length: 10 ft",
        "Overall house width: 40 ft",
      ],
    };
    const v = supportedMaterialInputs(t);
    expect(v.values).toMatchObject({
      layoutLength: 16,
      memberLength: 10,
      spacing: 16,
    });
    expect(materialTakeoffProposal(t).quantity).toBeNull();
    expect(Object.values(v.sources).join()).toContain("page 1");
  });
});
