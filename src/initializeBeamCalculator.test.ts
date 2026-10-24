import { expect, it } from "vitest";
import { initializeBeamCalculator } from "./initializeBeamCalculator";
import { relevantCalculators } from "./calculatorSelection";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
import { prepareDeckTakeoff } from "./deckTakeoff";
import { seed, migrate, type TakeoffItem, takeoffToLine } from "./model";
import { analysisFixture } from "../shared/analysis.fixture";
import { addAnalysisSuggestions } from "./planAnalysis";
const base = (): TakeoffItem => ({
  id: "generic",
  description: "3PLY 2X10 PT",
  specification: "3PLY 2X10 PT",
  category: "Framing",
  documentId: "plan",
  page: 1,
  quantity: null,
  unit: "boards",
  origin: "ai",
  destination: "Materials",
  confidence: "Low",
  classification: "Contractor input required",
  status: "Proposed",
  notes: "New work",
  workScope: "New work",
  included: true,
  location: "Deck A",
  sourceFacts: [
    "Three source observations of 3PLY 2X10 PT; physical run count to confirm",
  ],
});
it("selects the beam tool for a specification-only material without treating three observations as three runs", () => {
  const t = base();
  expect(relevantCalculators(t)[0]).toBe("beam-runs");
  const r = initializeBeamCalculator(t)!;
  expect(r).toMatchObject({ kind: "beam-runs", inputs: {}, verified: false });
  expect(r.inputs.runs).toBeUndefined();
});
it("uses spatial assembly evidence rather than generic description/category to prefill distinct runs, plies and explicit lengths", () => {
  const t = { ...base(), beamAssemblies: syntheticDeckBeams() };
  t.beamAssemblies[1].dimensions.push(
    fullDimension(t.beamAssemblies[1], "14'-6\""),
  );
  t.beamAssemblies.push(structuredClone(t.beamAssemblies[0]));
  const r = initializeBeamCalculator(t)!;
  expect(r.inputs).toMatchObject({
    runs: 3,
    plies1: 3,
    plies2: 3,
    plies3: 3,
    length2: 14.5,
  });
  expect(r.inputs.length1).toBeUndefined();
  expect(r.inputs.length3).toBeUndefined();
  expect(r.inputs.stock1).toBeUndefined();
  expect(r.verified).toBe(false);
});
it("reopens saved generic materials, fills missing ply fields after contractor run entry, and preserves intentional blanks", () => {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.takeoff = [
    {
      ...base(),
      calculation: {
        kind: "beam-runs",
        inputs: { runs: 3, length1: 18, length2: null, plies2: null },
        verified: false,
      },
    },
  ];
  const loaded = migrate(store),
    fixed = prepareDeckTakeoff(loaded.quotes[0]),
    r = fixed.takeoff[0].calculation!;
  expect(r.inputs).toMatchObject({
    runs: 3,
    length1: 18,
    length2: null,
    plies1: 3,
    plies2: null,
    plies3: 3,
  });
  expect(prepareDeckTakeoff(fixed)).toEqual(fixed);
  expect(fixed.lines).toEqual(q.lines);
});
it("keeps explicit manual mode, another selected calculator, reviewed values and verified calculations", () => {
  const t = base();
  expect(
    initializeBeamCalculator({ ...t, quantity: 12, quantityMethod: "Unknown" }),
  ).toBeUndefined();
  expect(
    initializeBeamCalculator({
      ...t,
      calculationBasis:
        "Manual calculator selection; contractor verification required",
    }),
  ).toBeUndefined();
  for (const kind of ["beams", "posts"]) {
    const r = { kind, inputs: { count: 4 }, verified: false };
    expect(initializeBeamCalculator({ ...t, calculation: r })).toEqual(r);
  }
  expect(
    initializeBeamCalculator({ ...t, status: "Reviewed", quantity: 9 }),
  ).toBeUndefined();
  const r = {
    kind: "beam-runs",
    inputs: { runs: 2, plies1: 4 },
    verified: true,
  };
  expect(initializeBeamCalculator({ ...t, calculation: r })).toEqual(r);
});
it("does not reinterpret hardware or joists with stale beam specifications as beam purchasing", () => {
  for (const description of [
    "Joist hangers",
    "Deck joists",
    "Beam screws",
    "Ledger flashing",
  ])
    expect(relevantCalculators({ ...base(), description })[0]).not.toBe(
      "beam-runs",
    );
});
it("new generic analysis opens the appropriate tool without replacing observations or approving quantities", () => {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.documents = [
    {
      id: "plan",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF"),
      addedAt: new Date().toISOString(),
    },
  ];
  const r = analysisFixture();
  r.suggestions = [
    {
      ...r.suggestions[1],
      description: "3PLY 2X10 PT",
      specification: "3PLY 2X10 PT",
      category: "Beams",
      quantity: null,
      unit: "boards",
      location: "Deck A",
      sourceFacts: base().sourceFacts,
      notes: "New work",
    },
  ];
  const added = addAnalysisSuggestions(q, r);
  const t = added.takeoff[0];
  expect(initializeBeamCalculator(t)?.kind).toBe("beam-runs");
  expect(initializeBeamCalculator(t)?.inputs.runs).toBeUndefined();
  expect(t.status).toBe("Proposed");
  expect(t.quantity).toBeNull();
  expect(() => takeoffToLine(added, t, "Materials")).toThrow();
});
it("withholds count and length when spatial evidence is ambiguous, even if three source observations exist", () => {
  const t = { ...base(), beamAssemblies: syntheticDeckBeams() };
  t.beamAssemblies[0].confidence = "Low";
  const r = initializeBeamCalculator(t)!;
  expect(r.kind).toBe("beam-runs");
  expect(r.inputs.runs).toBeUndefined();
  expect(r.inputs.length1).toBeUndefined();
});
it("consolidates evidenced repeated spatial beam sets while retaining source records and blocking unverified conversion", async () => {
  const { unresolvedOverlaps } = await import("./takeoffOverlap");
  const a = { ...base(), beamAssemblies: syntheticDeckBeams() },
    b = { ...a, id: "repeated" };
  const q = { ...seed().quotes[0], status: "Draft" as const, takeoff: [a, b] };
  const repaired = prepareDeckTakeoff(q);
  expect(unresolvedOverlaps(repaired, repaired.takeoff[0])).toHaveLength(0);
  expect(repaired.takeoff).toHaveLength(2);
  expect(repaired.takeoff[1].status).toBe("Rejected");
  expect(() =>
    takeoffToLine(repaired, repaired.takeoff[0], "Materials"),
  ).toThrow();
});
it("selecting the default tool alone leaves older observation quantities and units intact", () => {
  const t = { ...base(), quantity: 3, unit: "runs", quantityMethod: undefined };
  const q = { ...seed().quotes[0], status: "Draft" as const, takeoff: [t] };
  const reopened = prepareDeckTakeoff(q);
  expect(reopened.takeoff[0]).toEqual(t);
  expect(initializeBeamCalculator(reopened.takeoff[0])).toMatchObject({
    kind: "beam-runs",
    inputs: {},
    verified: false,
  });
  expect(prepareDeckTakeoff(reopened)).toEqual(reopened);
});
it("selects and prefills spatial beam proposals before scope or overall confidence is verified, without purchasing assumptions", async () => {
  const { completenessProblem } = await import("./takeoffRequirements");
  const { editTakeoff } = await import("./planAnalysis");
  const t = {
    ...base(),
    workScope: "Requires scope confirmation" as const,
    included: false,
    confidence: "Unspecified" as const,
    beamAssemblies: syntheticDeckBeams(),
  };
  t.beamAssemblies.forEach((b) => (b.scope = "Requires scope confirmation"));
  t.beamAssemblies[0].dimensions.push(
    fullDimension(t.beamAssemblies[0], "12'-6\""),
  );
  const recipe = initializeBeamCalculator(t)!;
  expect(recipe.kind).toBe("beam-runs");
  expect(recipe.inputs).toMatchObject({
    runs: 3,
    plies1: 3,
    plies2: 3,
    plies3: 3,
    length1: 12.5,
  });
  for (const field of ["waste", "stock1", "pieces1", "length2", "length3"])
    expect(recipe.inputs[field]).toBeUndefined();
  expect(recipe.arrangements).toEqual({});
  expect(recipe.verified).toBe(false);
  expect(completenessProblem(t)).toContain("Confirm which proposed beam lines");
  const confirmed = editTakeoff(t, {
    workScope: "New work",
    included: true,
    scopeVerified: true,
  });
  expect(confirmed.scopeVerified).toBe(true);
  expect(confirmed.status).toBe("Proposed");
  expect(confirmed.reviewAcknowledged).toBe(false);
});
it("fills an absent overall specification from consistent spatial evidence and preserves explicitly cleared fields", () => {
  const t = {
    ...base(),
    specification: undefined,
    beamAssemblies: syntheticDeckBeams(),
  };
  const q = { ...seed().quotes[0], status: "Draft" as const, takeoff: [t] };
  const repaired = prepareDeckTakeoff(q);
  expect(repaired.takeoff[0].specification).toBe("3PLY 2X10 PT");
  expect(repaired.takeoff[0].calculation!.inputs.plies1).toBe(3);
  expect(
    prepareDeckTakeoff({ ...q, takeoff: [{ ...t, specification: "" }] })
      .takeoff[0].specification,
  ).toBe("");
});
it("offers the beam tool without rewriting a previously entered observation quantity", () => {
  const t = {
    ...base(),
    quantity: 12,
    quantityMethod: "Unknown" as const,
    beamAssemblies: syntheticDeckBeams(),
  };
  expect(initializeBeamCalculator(t)?.kind).toBe("beam-runs");
  const q = { ...seed().quotes[0], status: "Draft" as const, takeoff: [t] };
  expect(prepareDeckTakeoff(q).takeoff[0]).toEqual(t);
});
it("scope confirmation preserves contractor-verified calculator values while requiring a separate approval", async () => {
  const { editTakeoff } = await import("./planAnalysis");
  const t = {
    ...base(),
    beamAssemblies: syntheticDeckBeams(),
    calculation: {
      kind: "beam-runs",
      inputs: { runs: 3, length1: 12, plies1: 3 },
      verified: true,
    },
  };
  t.beamAssemblies[0].scope = "Requires scope confirmation";
  const updated = editTakeoff(t, {
    workScope: "New work",
    included: true,
    scopeVerified: true,
  });
  expect(updated.calculation).toEqual(t.calculation);
  expect(updated.reviewAcknowledged).toBe(false);
  expect(updated.status).toBe("Proposed");
});
