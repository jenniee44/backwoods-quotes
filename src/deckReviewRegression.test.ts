import { expect, it } from "vitest";
import { seed, migrate, takeoffToLine, type TakeoffItem } from "./model";
import { evidenceScope } from "../shared/componentIdentity";
import { materialCategoryFor } from "../shared/takeoff";
import { friendlyMaterialName } from "./preliminaryMaterials";
import { prepareDeckTakeoff, materialTakeoffProposal } from "./deckTakeoff";
import { applyDeckReplacementScope } from "./deckReplacementScope";
import { purchasingGroups } from "./purchasingGroups";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
import { dimensionFixture } from "./structuredTakeoff.fixture";
import {
  dimensionValueProblem,
  dimensionInput,
} from "../shared/drawingDimensions";
import { resolveMaterialInputs } from "../shared/materialInputs";
import { mixedMaterialCallouts } from "../shared/mixedMaterialCallouts";
import { consolidateBeamReviews } from "./consolidateBeamReviews";
const beam = (): TakeoffItem => ({
  id: "mixed",
  documentId: "synthetic",
  page: 1,
  description: '2x6 deck joists @ 16" O.C.',
  specification: "3PLY 2X10 PT",
  category: "Joists",
  location: "Synthetic framed section",
  origin: "ai",
  status: "Proposed",
  confidence: "Low",
  quantity: null,
  unit: "boards",
  destination: "Materials",
  workScope: "Requires scope confirmation",
  included: false,
  sourceFacts: [
    '2x6 deck joists @ 16" O.C.',
    "Simpson LUS26 hanger or equivalent",
    "Exterior guards by others",
    "Existing concrete pier and footing to remain",
  ],
  beamAssemblies: syntheticDeckBeams(),
  notes: "Support conditions require verification",
  supportBasis: "Existing work",
});
const quote = () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [];
  q.analysisReports = [];
  q.documents = [
    {
      id: "synthetic",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQK",
      addedAt: "2026-01-01",
    },
  ];
  return q;
};
it("keeps a mixed beam record out of joist categories and recovers separate joist/hanger observations on reopening", () => {
  const q = quote();
  q.takeoff = [beam()];
  const next = prepareDeckTakeoff(q);
  expect(materialCategoryFor(next.takeoff[0])).toBe("Beams");
  expect(friendlyMaterialName(next.takeoff[0])).toBe("Beams");
  expect(next.takeoff[0].calculation?.kind).toBe("beam-runs");
  expect(materialTakeoffProposal(next.takeoff[0])).toMatchObject({
    quantity: 3,
    unit: "runs",
    purchase: null,
  });
  expect(
    next.takeoff.find((t) => t.category === "Joists")?.specification,
  ).toContain("2x6");
  expect(
    next.takeoff.find((t) => t.category === "Hangers / connectors")?.quantity,
  ).toBeNull();
  expect(prepareDeckTakeoff(next)).toEqual(next);
  expect(next.takeoff[0].description).toBe(q.takeoff[0].description);
});
it.each([
  "Helical piles by others",
  "Existing concrete pier and footing to remain",
  "Existing steel beam to remain",
  "Beam B2 by others",
])("does not apply unrelated scope to new timber Beam B1: %s", (note) => {
  const t = {
    ...beam(),
    description: "Timber beam B1",
    sourceFacts: [note],
    notes: "Verify scope",
    subcontractorBasis: "Explicit by others" as const,
  };
  expect(evidenceScope(t)).toBe("Requires scope confirmation");
});
it("still excludes the actual named by-others/existing component", () => {
  expect(
    evidenceScope({
      ...beam(),
      description: "Helical piles",
      specification: "Helical piles",
      beamAssemblies: [],
      sourceFacts: ["Helical piles by others"],
    }),
  ).toBe("By others / excluded");
  expect(
    evidenceScope({
      ...beam(),
      description: "Existing steel beam",
      specification: "Structural steel",
      sourceFacts: ["Existing steel beam to remain"],
    }),
  ).toBe("Existing work to remain");
});
it("prepares a complete confirmed scope without inventing quantities or approving materials, and preserves manual estimate lines", () => {
  const q = quote();
  q.takeoff = [
    beam(),
    {
      ...beam(),
      id: "steel",
      description: "Existing steel beam",
      specification: "Structural steel",
      sourceFacts: ["Existing steel beam to remain"],
      beamAssemblies: [],
      workScope: "Existing work to remain",
      destination: "Informational",
    },
  ];
  const originalLines = structuredClone(q.lines);
  const next = prepareDeckTakeoff(applyDeckReplacementScope(q, true));
  for (const category of [
    "Beams",
    "Joists",
    "Posts",
    "Decking",
    "Guards / railings",
    "Stairs / stringers",
    "Hangers / connectors",
    "Structural fasteners",
  ])
    expect(
      next.takeoff.some(
        (t) => t.status !== "Rejected" && t.category === category,
      ),
    ).toBe(true);
  expect(
    next.takeoff.find((t) => /Helical piles/.test(t.description))?.destination,
  ).toBe("Subcontractor");
  expect(
    next.takeoff.find((t) => /demolition labour/.test(t.description))
      ?.destination,
  ).toBe("Labour");
  expect(
    next.takeoff.find((t) => t.description === "Disposal bin")?.category,
  ).toBe("Dump / Disposal Fees");
  expect(next.takeoff.find((t) => t.id === "steel")?.workScope).toBe(
    "Existing work to remain",
  );
  expect(purchasingGroups(next, next.takeoff).length).toBeGreaterThan(6);
  expect(next.takeoff.every((t) => t.status !== "Approved")).toBe(true);
  for (const t of next.takeoff)
    expect(() => takeoffToLine(next, t, "Materials")).toThrow();
  expect(next.lines).toEqual(originalLines);
  expect(applyDeckReplacementScope(next, true).takeoff.length).toBe(
    next.takeoff.length,
  );
  const store = seed();
  store.quotes = [next];
  expect(migrate(store).quotes[0].takeoff).toEqual(next.takeoff);
});
it("does not overwrite contractor exclusions, verified values or intentionally blank calculators", () => {
  const q = quote();
  const t = beam();
  t.calculation = { kind: "joists", inputs: { length: null }, verified: false };
  t.scopeOverride = "Excluded";
  t.scopeVerified = true;
  t.status = "Rejected";
  q.takeoff = [t];
  expect(
    prepareDeckTakeoff(applyDeckReplacementScope(q, true)).takeoff[0],
  ).toEqual(t);
});
it("preserves an explicit existing-to-remain decision when no foreign scope qualifier proves an old inference error", () => {
  const q = quote();
  const existing = {
    ...beam(),
    id: "retained",
    description: "Existing footing",
    specification: "Concrete footing",
    beamAssemblies: [],
    sourceFacts: ["Synthetic component reference"],
    notes: "Synthetic source",
    workScope: "Existing work to remain" as const,
    included: false,
  };
  q.takeoff = [existing];
  expect(prepareDeckTakeoff(q).takeoff[0]).toEqual(existing);
});
it("does not retain new steel hardware merely because the project retains an existing steel beam", () => {
  const q = quote();
  q.takeoff = [
    {
      ...beam(),
      id: "hardware",
      description: "Simpson LUS26 steel joist hangers",
      specification: "Galvanized steel LUS26",
      category: "Hangers / connectors",
      beamAssemblies: [],
      sourceFacts: ["Specified hangers"],
      notes: "New work",
      workScope: "New work",
      included: true,
    },
  ];
  const t = applyDeckReplacementScope(q, true).takeoff.find(
    (t) => t.id === "hardware",
  )!;
  expect(t.scopeOverride).toBe("Included");
  expect(t.workScope).toBe("New work");
});
it("accepts rounded numeric serialization of written fractions but canonicalizes inputs without allowing a different dimension", () => {
  const d = dimensionFixture({ written: "7'-5 1/2\"", value: 7.4583 });
  expect(dimensionValueProblem(d)).toBe("");
  const f = dimensionInput(d, 1)!;
  expect(f.value).toBeCloseTo(7 + 5.5 / 12, 10);
  const values = resolveMaterialInputs([
    f,
    { ...f, value: 7.4583, evidence: "Written spacing-axis width 7'-5 1/2\"" },
  ]);
  expect(values.conflicts).toEqual([]);
  expect(values.values.layoutLength).toBeCloseTo(7 + 5.5 / 12, 10);
  expect(dimensionValueProblem({ ...d, value: 7.4 })).not.toBe("");
});
it("does not add joist geometry or hanger quantities when recovering mixed callouts", () => {
  const found = mixedMaterialCallouts(beam());
  expect(found).toHaveLength(2);
  expect(
    found.every(
      (t) =>
        t.quantity === null &&
        t.materialInputs?.length === 0 &&
        t.beamAssemblies?.length === 0,
    ),
  ).toBe(true);
});
it("never upgrades unreadable or speculative component text while recovering a mixed observation", () => {
  const t = beam(); t.description = "Beam assembly"; t.sourceFacts = ["Possibly Simpson LUS26 hanger; unreadable model"];
  expect(mixedMaterialCallouts(t)).toEqual([]);
  t.sourceFacts = ['2x6 deck joists @ 16" O.C.']; t.warnings = ["Member size specification unreadable"];
  expect(mixedMaterialCallouts(t)).toEqual([]);
});
it("does not flag two unknown beam quantities as conflicting because one unit is blank", () => {
  const a = {
    ...beam(),
    description: "Beam",
    category: "Beams",
    workScope: "New work" as const,
    included: true,
    sourceFacts: [],
    materialInputs: [],
    unit: "each",
  };
  const b = { ...structuredClone(a), id: "same-source", unit: "" };
  const result = consolidateBeamReviews([a, b]);
  expect(result[1].status).toBe("Rejected");
  expect(
    result[0].warnings?.some((w) => w.includes("Conflicting quantities")),
  ).toBe(false);
});
