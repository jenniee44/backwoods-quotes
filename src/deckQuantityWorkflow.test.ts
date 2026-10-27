import { expect, it } from "vitest";
import { seed, migrate, type TakeoffItem } from "./model";
import { materialTakeoffProposal } from "./deckTakeoff";
import { purchasingGroups } from "./purchasingGroups";
import { prepareMaterialsSummary } from "./materialsSummary";
import { approveTakeoff, reviewTakeoff } from "./planAnalysis";
import { addContractorScope } from "./contractorScopeDecisions";
import type { MaterialInput } from "../shared/materialInputs";
const input = (
  field: MaterialInput["field"],
  value: number,
  unit: MaterialInput["unit"],
): MaterialInput => ({
  field,
  value,
  unit,
  page: 1,
  evidence: `Explicit synthetic deck D1 ${field}: ${value} ${unit}`,
  readable: true,
});
const base = (): TakeoffItem => ({
  id: "drawing-joists",
  documentId: "synthetic",
  page: 1,
  description: "Deck joists",
  specification: "2x6 PT @ 16 in OC",
  quantity: null,
  unit: "boards",
  origin: "ai",
  status: "Proposed",
  confidence: "High",
  notes: "Scope not confirmed",
  classification: "Plan fact",
  destination: "Materials",
  location: "Deck D1",
  workScope: "Requires scope confirmation",
  included: false,
});
it.each([
  [16, 16, 13],
  [20, 12, 21],
  [44, 12, 45],
  [24.25, 16, 20],
])(
  "proposes positions from %s feet at %s inches without requiring purchasing/scope approval",
  (width, spacing, count) => {
    const t = base();
    t.specification = `2x6 PT @ ${spacing} in OC`;
    t.materialInputs = [
      input("layoutLength", width, "ft"),
      input("spacing", spacing, "in"),
      input("layoutClear", 1, "option"),
      input("edgeIncluded", 1, "option"),
    ];
    const p = materialTakeoffProposal(t);
    expect(p).toMatchObject({
      quantity: count,
      unit: "joists",
      purchase: null,
    });
    expect(p.formula).toContain(String(width));
    expect(p.sources.join(" ")).toContain("page 1");
    expect(p.missing.join(" ")).toContain("job scope");
    const q = seed().quotes[0];
    q.takeoff = [t];
    expect(purchasingGroups(q, q.takeoff)[0].quantity).toBe(count);
    expect(() => approveTakeoff(reviewTakeoff(t))).toThrow();
    expect(t.quantity).toBeNull();
  },
);
it("requests only absent geometry, keeps intentional blanks and does not infer hanger counts from joist counts", () => {
  const t = base();
  t.workScope = "New work";
  t.included = true;
  t.materialInputs = [input("spacing", 16, "in")];
  const message = materialTakeoffProposal(t).missing.join(" ");
  expect(message).toContain("framing layout width");
  expect(message).not.toContain("Confirm joist spacing");
  t.description = "Simpson LUS26 joist hangers";
  t.specification = "LUS26";
  t.materialInputs.push(input("count", 45, "each"));
  expect(materialTakeoffProposal(t).quantity).toBeNull();
  expect(materialTakeoffProposal(t).missing.join(" ")).toContain(
    "connection count",
  );
  t.materialInputs.push(
    input("connections", 18, "each"),
    input("piecesPerConnection", 1, "each"),
  );
  expect(materialTakeoffProposal(t).quantity).toBe(18);
  t.calculation = {
    kind: "hardware",
    inputs: { count: null, pieces: 1 },
    verified: false,
  };
  expect(materialTakeoffProposal(t).quantity).toBeNull();
});
it.each(["Joist hangers", "Ledger flashing"])(
  "consolidates explicit repeated %s references once, preserving archived records and conflicts",
  (description) => {
    const a = {
      ...base(),
      description,
      specification:
        description === "Joist hangers"
          ? "Simpson LUS26 joist hanger"
          : "Aluminium ledger flashing",
      sourceFacts: ["Repeated view of the same physical assembly D1"],
      quantity: 18,
      unit: "each",
      workScope: "New work" as const,
      included: true,
      scopeGroup:
        description === "Joist hangers"
          ? "Hardware & Connectors"
          : "Flashing & Waterproofing",
    };
    const b = {
      ...a,
      id: "other-view",
      page: 2,
      specification:
        description === "Joist hangers" ? "LUS26" : "Aluminum ledger flashing",
    };
    const prepared = prepareMaterialsSummary([a, b], true);
    expect(prepared.filter((t) => t.status !== "Rejected")).toHaveLength(1);
    expect(prepared[0].quantity).toBe(18);
    expect(prepared[0].sourceFacts?.join(" ")).toContain("page 2");
    expect(prepared[1].id).toBe("other-view");
    expect(prepareMaterialsSummary(prepared, true)).toEqual(prepared);
    expect(
      prepareMaterialsSummary([a, { ...b, quantity: 24 }], true).filter(
        (t) => t.status !== "Rejected",
      ),
    ).toHaveLength(2);
    expect(
      prepareMaterialsSummary([a, { ...b, location: "Deck D2" }], true).filter(
        (t) => t.status !== "Rejected",
      ),
    ).toHaveLength(2);
  },
);
it("a contractor-entered pile alternative excludes selected unapproved footings without rewriting engineering observations or pricing", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  const source = {
    ...base(),
    id: "footing",
    description: "Concrete footing and pier",
    notes: "Engineering requires specified concrete foundations",
    sourceFacts: ["Original footing diameter and depth require verification"],
    workScope: "New work" as const,
    included: true,
  };
  q.takeoff = [source];
  const original = structuredClone(q);
  const next = addContractorScope(
    q,
    "Helical piles — subcontractor",
    "Subcontracted helical piles",
    "",
    12,
    "piles",
    [source.id],
    true,
  );
  expect(next.takeoff[0].notes).toBe(source.notes);
  expect(next.takeoff[0].sourceFacts).toEqual(source.sourceFacts);
  expect(next.takeoff[0].status).toBe("Rejected");
  expect(next.takeoff[1]).toMatchObject({
    quantity: 12,
    destination: "Subcontractor",
    status: "Proposed",
    confidence: "Unspecified",
    documentId: "",
  });
  expect(next.lines).toEqual(original.lines);
  expect(next.pricing).toEqual(original.pricing);
  expect(q).toEqual(original);
  const store = seed();
  store.quotes = [next];
  expect(migrate(store).quotes[0].takeoff).toHaveLength(2);
  expect(() =>
    addContractorScope(
      next,
      "Helical piles — subcontractor",
      "Subcontracted helical piles",
      "",
      12,
      "piles",
      [],
      true,
    ),
  ).toThrow(/already exists/);
  expect(() =>
    addContractorScope(
      { ...q, takeoff: [{ ...source, status: "Approved" }] },
      "Helical piles — subcontractor",
      "Piles",
      "",
      12,
      "piles",
      [source.id],
      true,
    ),
  ).toThrow(/unapproved/);
});
it.each(["Decking", "Railings / guards", "Stairs", "Demolition"] as const)(
  "adds explicitly included %s without inventing quantities, specs, hours or prices",
  (choice) => {
    const q = seed().quotes[0];
    q.status = "Draft";
    const next = addContractorScope(
      q,
      choice,
      choice,
      "",
      null,
      "scope",
      [],
      true,
    );
    const t = next.takeoff.at(-1)!;
    expect(t).toMatchObject({
      quantity: null,
      specification: "",
      status: "Proposed",
      included: true,
    });
    expect(next.lines).toEqual(q.lines);
    expect(() => approveTakeoff(reviewTakeoff(t))).toThrow();
  },
);
it("respects corrected and intentionally blank preliminary quantities rather than reapplying AI geometry", async () => {
  const {
    applyQuickMaterialChanges,
    quickMaterialDraft,
    quickMaterialChanges,
  } = await import("./quickMaterialEdit");
  const t = base();
  t.materialInputs = [
    input("layoutLength", 16, "ft"),
    input("spacing", 16, "in"),
    input("layoutClear", 1, "option"),
    input("edgeIncluded", 1, "option"),
  ];
  const corrected = applyQuickMaterialChanges(
    t,
    quickMaterialChanges(t, {
      ...quickMaterialDraft(t),
      quantity: 14,
      unit: "boards",
    }),
  );
  expect(materialTakeoffProposal(corrected)).toMatchObject({
    quantity: 14,
    unit: "boards",
    purchase: null,
  });
  const blank = applyQuickMaterialChanges(
    corrected,
    quickMaterialChanges(corrected, {
      ...quickMaterialDraft(corrected),
      quantity: null,
    }),
  );
  expect(materialTakeoffProposal(blank).quantity).toBeNull();
});
it("repairs only generated legacy hardware connection inputs and preserves manual and verified counts", async () => {
  const { proposedMaterialRecipe, supportedMaterialInputs } =
    await import("./deckTakeoff");
  const t = {
    ...base(),
    description: "LUS26 joist hangers",
    specification: "LUS26",
    workScope: "New work" as const,
    included: true,
    materialInputs: [
      input("count", 45, "each"),
      input("piecesPerConnection", 1, "each"),
    ],
  };
  const generated = {
    ...t,
    calculation: {
      kind: "hardware",
      verified: false,
      inputs: { count: 45, pieces: 1 },
      inputSources: { count: supportedMaterialInputs(t).sources.count },
    },
  };
  expect(proposedMaterialRecipe(generated)?.inputs.count).toBeUndefined();
  expect(materialTakeoffProposal(generated).quantity).toBeNull();
  expect(
    proposedMaterialRecipe({
      ...generated,
      calculation: { ...generated.calculation, inputSources: {} },
    })?.inputs.count,
  ).toBe(45);
  expect(
    proposedMaterialRecipe({
      ...generated,
      calculation: { ...generated.calculation, verified: true },
    })?.inputs.count,
  ).toBe(45);
});
it("keeps beam runs, nine support intervals and 27 span-by-ply sections separate from purchasing", async () => {
  const { syntheticDeckBeams } = await import("../shared/spatialBeam.fixture");
  const { beamLayout } = await import("./framingLayout");
  const { prepareDeckTakeoff } = await import("./deckTakeoff");
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [
    {
      ...base(),
      description: "Deck beams",
      specification: "3PLY 2X10 PT",
      beamAssemblies: syntheticDeckBeams(),
      notes: "New work",
      workScope: "New work",
      included: true,
      unit: "runs",
    },
  ];
  const t = prepareDeckTakeoff(q).takeoff[0];
  const spans = t.beamAssemblies!.reduce(
    (n, b) => n + beamLayout(t, [b]).spans.length,
    0,
  );
  expect(spans).toBe(9);
  expect(spans * 3).toBe(27);
  expect(materialTakeoffProposal(t)).toMatchObject({
    quantity: 3,
    unit: "runs",
    purchase: null,
  });
  expect(t.calculation?.inputs.stock1).toBeUndefined();
  expect(t.status).toBe("Proposed");
});
it("can propose decking area from supported boundaries while board coverage and stock remain missing", () => {
  const t = {
    ...base(),
    description: "Decking boards",
    specification: "PT decking specification to verify",
    workScope: "New work" as const,
    included: true,
    materialInputs: [
      input("layoutLength", 20, "ft"),
      input("layoutWidth", 16, "ft"),
      input("layoutClear", 1, "option"),
    ],
  };
  expect(materialTakeoffProposal(t)).toMatchObject({
    quantity: 320,
    unit: "sq ft",
    purchase: null,
  });
  const missing = materialTakeoffProposal(t).missing.join(" ");
  expect(missing).toContain("Actual board width");
  expect(missing).toContain("stock");
});
it("does not turn total visible support symbols into new footing quantities", () => {
  const t = {
    ...base(),
    description: "Concrete footing and pier assemblies",
    specification: "Concrete piers per drawing",
    workScope: "New work" as const,
    included: true,
    supportBasis: "Total visible locations" as const,
    materialInputs: [input("count", 12, "each")],
  };
  expect(materialTakeoffProposal(t).quantity).toBeNull();
  expect(materialTakeoffProposal(t).missing.join(" ")).toContain(
    "new included support locations",
  );
});
it("sends a consolidated hanger purchase once and preserves all manual estimate lines", async () => {
  const { sendShoppingList } = await import("./materialsSummary");
  const a = {
    ...base(),
    description: "Joist hangers",
    specification: "Simpson LUS26",
    quantity: 18,
    unit: "each",
    workScope: "New work" as const,
    included: true,
    sourceFacts: ["Repeated view of the same physical assembly D1"],
  };
  const items = prepareMaterialsSummary(
    [a, { ...a, id: "repeat", page: 2 }],
    true,
  );
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = items;
  q.takeoff[0] = approveTakeoff(reviewTakeoff(q.takeoff[0]));
  const next = sendShoppingList(q);
  expect(next.lines.slice(0, q.lines.length)).toEqual(q.lines);
  expect(next.lines.filter((l) => l.takeoffId === a.id)).toHaveLength(1);
  expect(next.lines.at(-1)?.quantity).toBe(18);
  expect(() => sendShoppingList(next)).toThrow(/No approved materials/);
});
it("uses explicitly associated cross-joist widths in saved analyses, never ambiguous overall dimensions or intentional blanks", () => {
  const t = {
    ...base(),
    workScope: "New work" as const,
    included: true,
    materialInputs: [
      {
        ...input("layoutWidth", 16, "ft"),
        evidence: "Written D1 width perpendicular to joists: 16 ft",
      },
      input("layoutClear", 1, "option"),
      input("edgeIncluded", 1, "option"),
    ],
  };
  expect(materialTakeoffProposal(t).quantity).toBe(13);
  expect(t.materialInputs[0].field).toBe("layoutWidth");
  expect(
    materialTakeoffProposal({
      ...t,
      materialInputs: t.materialInputs.map((f) =>
        f.field === "layoutWidth"
          ? { ...f, evidence: "Overall horizontal deck width: 16 ft" }
          : f,
      ),
    }).quantity,
  ).toBeNull();
  expect(
    materialTakeoffProposal({
      ...t,
      calculation: {
        kind: "joists",
        verified: false,
        inputs: { length: null },
      },
    }).quantity,
  ).toBeNull();
});
