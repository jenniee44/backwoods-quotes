import { expect, it } from "vitest";
import {
  separateMixedHardware,
  materialIdentityProblem,
} from "../shared/materialIdentity";
import { materialCategoryFor } from "../shared/takeoff";
import { resolveMaterialInputs } from "../shared/materialInputs";
import { repairMaterialIdentity } from "./repairMaterialIdentity";
import { seed, type TakeoffItem } from "./model";
import { materialTakeoffProposal } from "./deckTakeoff";

// Redacted field projection of the supplied saved failure. No project identity,
// drawing coordinates, or customer document is included in this public regression.
const mixed: TakeoffItem = {
  notes: "Beam length not readable; no purchasing quantity inferred.",
  id: "mixed",
  documentId: "redacted",
  page: 1,
  origin: "ai",
  status: "Proposed",
  description: "3-ply 2x10 PT beam at connection detail with LUS26 hanger note",
  specification: "3PLY 2X10 PT",
  location: "Connection detail / beam-to-joist support",
  quantity: null,
  unit: "each",
  confidence: "Low",
  destination: "Materials",
  sourceFacts: ["Simpson LUS26 hanger or equivalent", "3PLY 2X10 PT"],
  materialInputs: [
    {
      field: "connections",
      value: 1,
      unit: "each",
      page: 1,
      readable: true,
      evidence:
        "1 LUS26 hanger or equivalent shown at joist-to-beam connection detail.",
    },
    {
      field: "piecesPerConnection",
      value: 1,
      unit: "each",
      page: 1,
      readable: true,
      evidence: "Single hanger callout at the detail.",
    },
  ],
  calculation: {
    kind: "hardware",
    inputs: { count: 1, pieces: 1 },
    verified: false,
  },
};
it("separates a real saved mixed beam/hanger identity before categorization and calculation", () => {
  expect(materialIdentityProblem(mixed)).toBeTruthy();
  expect(materialCategoryFor(mixed)).toBeUndefined();
  const split = separateMixedHardware(mixed)!;
  expect(split.primary.category).toBe("Beams");
  expect(split.primary.destination).toBe("Informational");
  expect(split.related?.category).toBe("Hangers / connectors");
  expect(split.related?.specification).toMatch(/LUS26/);
  expect(split.related?.specification).not.toMatch(/2X10/);
  expect(split.related?.quantity).toBeNull();
  const q = repairMaterialIdentity({ ...seed().quotes[0], takeoff: [mixed] });
  expect(q.takeoff).toHaveLength(2);
  expect(q.takeoff[0].identitySource?.calculation?.inputs.count).toBe(1);
  for (const t of q.takeoff)
    expect(materialTakeoffProposal(t).quantity).toBeNull();
  expect(repairMaterialIdentity(q).takeoff).toEqual(q.takeoff);
});
it("never promotes a single connection-detail illustration to the project connection count", () => {
  expect(
    resolveMaterialInputs(mixed.materialInputs).values.connections,
  ).toBeUndefined();
});
it("accepts serialization roundoff while preserving genuinely different dimensions", () => {
  const input = {
    field: "layoutWidth" as const,
    value: 4.6667,
    unit: "ft" as const,
    page: 1,
    readable: true,
    evidence: "Main framing plan width dimension.",
  };
  expect(
    resolveMaterialInputs([input, { ...input, value: 4.666666666666667 }])
      .conflicts,
  ).toEqual([]);
  expect(
    resolveMaterialInputs([input, { ...input, value: 4.67 }]).conflicts,
  ).toContain("layoutWidth");
});
it("preserves three distinct source beam lines without borrowing connection counts", () => {
  const beams = [0.2, 0.4, 0.6].map((y) => ({
    page: 1,
    sheet: "S1",
    drawingLabel: "",
    start: { x: 0.1, y },
    end: { x: 0.9, y },
    specification: "3PLY 2X10 PT",
    labels: [],
    supports: [],
    dimensions: [],
    scope: "Requires scope confirmation" as const,
    confidence: "Medium" as const,
    evidence: "Distinct physical beam line in framing plan",
  }));
  const split = separateMixedHardware({
    ...mixed,
    location: "Framing plan",
    beamAssemblies: beams,
  })!;
  expect(split.primary.beamAssemblies).toEqual(beams);
  expect(split.primary.quantity).toBeNull();
  expect(split.related?.beamAssemblies).toEqual([]);
});
it("retains converted estimate records and blocks their inconsistent identity from a new proposal", () => {
  const converted = { ...mixed, convertedLineId: "existing-line" };
  const q = repairMaterialIdentity({
    ...seed().quotes[0],
    takeoff: [converted],
  });
  expect(q.takeoff[0]).toEqual(converted);
  expect(materialTakeoffProposal(q.takeoff[0]).quantity).toBeNull();
});
it("a visible post note is not a project post count", () => {
  const post: TakeoffItem = {
    ...mixed,
    description: "6x6 PT post support note",
    specification: "6x6 PT",
    quantity: 1,
    calculation: undefined,
    materialInputs: [],
    assumptions: ["Count reflects one visible note location only"],
  };
  const repaired = repairMaterialIdentity({
    ...seed().quotes[0],
    takeoff: [post],
  });
  expect(repaired.takeoff[0].quantity).toBeNull();
  expect(repaired.takeoff[0].identitySource?.quantity).toBe(1);
});
it("complete confirmed replacement scope survives save/reload without approving quantities", async () => {
  const { applyDeckReplacementScope } = await import("./deckReplacementScope");
  const { migrate } = await import("./model");
  const q = applyDeckReplacementScope(
    { ...seed().quotes[0], takeoff: [mixed] },
    true,
  );
  const store = seed();
  store.quotes = [q];
  const saved = migrate(JSON.parse(JSON.stringify(store))).quotes[0];
  expect(saved.takeoffProjectScope).toBe("deck-replacement");
  expect(
    saved.takeoff.some(
      (t) => t.identitySource?.specification === "3PLY 2X10 PT",
    ),
  ).toBe(true);
  for (const category of [
    "Joists",
    "Beams",
    "Decking",
    "Ledger",
    "Guards / railings",
    "Stairs / stringers",
    "Hangers / connectors",
  ])
    expect(
      saved.takeoff.some((t) => t.category === category && t.included),
    ).toBe(true);
  for (const destination of ["Labour", "Other Costs", "Subcontractor"])
    expect(
      saved.takeoff.some((t) => t.destination === destination && t.included),
    ).toBe(true);
  expect(saved.takeoff.some((t) => t.status === "Approved")).toBe(false);
});
it("saved response passes the full review/grouping pipeline with one correctly specified hanger", async () => {
  const { prepareDeckTakeoff } = await import("./deckTakeoff");
  const { prepareMaterialsSummary } = await import("./materialsSummary");
  const { purchasingGroups } = await import("./purchasingGroups");
  const q = {
    ...seed().quotes[0],
    takeoff: [mixed, { ...mixed, id: "repeated-detail" }],
  };
  const repaired = prepareDeckTakeoff(q);
  repaired.takeoff = prepareMaterialsSummary(repaired.takeoff, true);
  const groups = purchasingGroups(repaired, repaired.takeoff);
  expect(groups.filter((g) => g.name === "Joist hangers")).toHaveLength(1);
  const hangers = repaired.takeoff.filter(
    (t) =>
      t.status !== "Rejected" &&
      materialCategoryFor(t) === "Hangers / connectors",
  );
  expect(hangers).toHaveLength(1);
  expect(hangers[0].specification).toMatch(/LUS26/);
  expect(materialTakeoffProposal(hangers[0]).quantity).toBeNull();
  expect(hangers[0].beamAssemblies).toEqual([]);
});
it("a forged hardware category or recipe cannot override a structural specification", () => {
  const beam = {
    ...mixed,
    description: "Built-up beam assembly",
    sourceFacts: [],
  };
  expect(
    materialIdentityProblem({
      ...beam,
      category: "Hangers / connectors",
      calculation: undefined,
    }),
  ).toBeTruthy();
  expect(materialIdentityProblem({ ...beam, category: "Beams" })).toBeTruthy();
});
it("removes only an obsolete generated input-conflict warning after roundoff reconciliation", async () => {
  const { repairDrawingIdentity } = await import("./repairDrawingIdentity");
  const t: TakeoffItem = {
    ...mixed,
    description: "Deck joists",
    specification: '2x6 @ 16" O.C.',
    calculation: undefined,
    materialInputs: [
      {
        field: "layoutWidth",
        value: 4.6667,
        unit: "ft",
        page: 1,
        readable: true,
        evidence: "Written layout width",
      },
      {
        field: "layoutWidth",
        value: 4.666666666666667,
        unit: "ft",
        page: 1,
        readable: true,
        evidence: "Written layout width",
      },
    ],
    warnings: [
      "DO NOT SCALE",
      "Conflicting/unconfirmed drawing input observations: Reconcile conflicting, unreadable or unconfirmed drawing inputs before approval.",
    ],
  };
  const q = repairDrawingIdentity({ ...seed().quotes[0], takeoff: [t] });
  expect(q.takeoff[0].warnings).toEqual(["DO NOT SCALE"]);
});
