import { expect, it } from "vitest";
import { consolidateBeamReviews } from "./consolidateBeamReviews";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
import { initializeBeamCalculator } from "./initializeBeamCalculator";
import { spatialBeamReviewProblem } from "./spatialBeamPrefill";
import { calculateMaterial } from "../shared/materialCalculators";
import type { TakeoffItem } from "./model";
const beam = (id: string): TakeoffItem => ({
  id,
  description: "Deck beams",
  specification: "3PLY 2X10 PT",
  quantity: null,
  unit: "runs",
  documentId: "synthetic",
  page: 1,
  notes: "New work",
  status: "Proposed",
  confidence: "High",
  origin: "ai",
  destination: "Materials",
  workScope: "New work",
  beamAssemblies: syntheticDeckBeams(),
});
it("combines same physical sets from overlapping crops, not repeated label counts, and prefills unverified runs and plies", () => {
  const a = beam("a"),
    b = beam("b");
  b.sourceDetailView = 2;
  b.beamAssemblies!.forEach((ob) => {
    ob.start.x += 0.001;
    ob.end.x -= 0.001;
  });
  const merged = consolidateBeamReviews([a, b]);
  expect(merged.filter((t) => t.status === "Proposed")).toHaveLength(1);
  expect(merged).toHaveLength(2);
  expect(merged[1].beamAssemblies).toEqual(b.beamAssemblies);
  expect(merged[0].beamAssemblies).toHaveLength(6);
  expect(merged[0].sourceFacts!.join(" ")).toContain("detail 2");
  const recipe = initializeBeamCalculator(merged[0])!;
  expect(recipe.inputs).toEqual({ runs: 3, plies1: 3, plies2: 3, plies3: 3 });
  expect(recipe.verified).toBe(false);
  expect(calculateMaterial(recipe).quantity).toBeNull();
  expect(JSON.stringify(a)).not.toContain("Source observation");
  expect(consolidateBeamReviews(merged)).toEqual(merged);
});
it("preserves dimension conflicts and never adds differing proposed quantities", () => {
  const a = beam("a"),
    b = beam("b");
  a.beamAssemblies![0].dimensions.push(
    fullDimension(a.beamAssemblies![0], "12'-0\""),
  );
  b.beamAssemblies![0].dimensions.push(
    fullDimension(b.beamAssemblies![0], "14'-0\""),
  );
  a.quantity = 3;
  b.quantity = 4;
  const [t] = consolidateBeamReviews([a, b]);
  expect(t.quantity).toBeNull();
  expect(t.warnings!.join()).toContain("Conflicting quantities");
  expect(spatialBeamReviewProblem(t)).toContain(
    "Conflicting full beam lengths",
  );
  expect(initializeBeamCalculator(t)?.inputs.length1).toBeUndefined();
});
it("does not merge separate assemblies, scope alternatives, manual edits, reviewed items or intentional calculator blanks", () => {
  for (const delta of [
    { location: "Other deck" },
    { specification: "2PLY 2X8 PT" },
    { overlapReviews: ["Contractor confirmed separate"] },
    { workScope: "By others / excluded" as const },
    { alternativeOption: "Other assembly" },
    { reviewAcknowledged: true },
    {
      calculation: {
        kind: "beam-runs" as const,
        inputs: { runs: null },
        verified: false,
      },
    },
  ]) {
    expect(
      consolidateBeamReviews([beam("a"), { ...beam("b"), ...delta }]),
    ).toHaveLength(2);
  }
  const b = beam("b");
  b.beamAssemblies!.forEach((ob) => {
    ob.start.y += 0.01;
    ob.end.y += 0.01;
  });
  expect(consolidateBeamReviews([beam("a"), b])).toHaveLength(2);
});
it("unknown scope and labels alone never create purchasable beam counts", () => {
  const t = beam("a");
  t.beamAssemblies!.forEach((ob) => (ob.scope = "Requires scope confirmation"));
  expect(initializeBeamCalculator(t)?.inputs.runs).toBeUndefined();
  t.beamAssemblies = [];
  t.sourceFacts = ["3PLY 2X10 PT repeated three times"];
  expect(initializeBeamCalculator(t)?.inputs.runs).toBeUndefined();
});
it("proposes the evidenced physical count rather than defaulting to three", () => {
  for (const count of [2, 4]) {
    const t = beam("count");
    const extra = structuredClone(t.beamAssemblies![0]);
    extra.start.y = 0.9;
    extra.end.y = 0.9;
    extra.labels.forEach((l) => (l.point.y = 0.89));
    extra.supports.forEach((s) => (s.point.y = 0.9));
    t.beamAssemblies = [...t.beamAssemblies!, extra].slice(0, count);
    expect(initializeBeamCalculator(t)!.inputs.runs).toBe(count);
  }
});
it("reconciles one-line and three-line partial observations without adding their reported counts", () => {
  const a = beam("partial"),
    b = beam("complete");
  a.beamAssemblies = a.beamAssemblies!.slice(0, 1);
  a.quantity = 1;
  b.quantity = 3;
  const result = consolidateBeamReviews([a, b]);
  expect(result.filter((t) => t.status === "Proposed")).toHaveLength(1);
  expect(initializeBeamCalculator(result[0])!.inputs.runs).toBe(3);
  expect(result[0].quantity).toBeNull();
  expect(result[1].quantity).toBe(3);
});
it("refreshes only exactly reproducible saved proposals and preserves manually edited or intentionally blank recipes", () => {
  const a = beam("partial"),
    b = beam("complete");
  a.beamAssemblies = a.beamAssemblies!.slice(0, 1);
  a.calculation = initializeBeamCalculator(a);
  const joined = consolidateBeamReviews([a, b]);
  expect(joined[1].status).toBe("Rejected");
  expect(initializeBeamCalculator(joined[0])!.inputs.runs).toBe(3);
  a.calculation!.inputs.length1 = null;
  expect(consolidateBeamReviews([a, b])[1].status).toBe("Proposed");
});
