import { expect, it } from "vitest";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
import { beamLayout } from "./framingLayout";
import {
  spatialBeamRecipe,
  spatialBeamReviewProblem,
} from "./spatialBeamPrefill";
import { rotatedDrawingPoint } from "./DrawingLocationContext";
import { validSpatialBeams } from "../shared/spatialBeams";
import type { TakeoffItem } from "./model";
const item = (): TakeoffItem => ({
  id: "test",
  documentId: "plan",
  page: 1,
  description: "Deck beams",
  quantity: null,
  unit: "runs",
  notes: "New work",
  confidence: "High",
  status: "Proposed",
  beamAssemblies: syntheticDeckBeams(),
});
it.each([2, 3, 4])(
  "separates %i runs from supports, spans, plies and purchase boards without counting labels",
  (count) => {
    const t = item();
    const extra = structuredClone(t.beamAssemblies![0]);
    extra.start.y = extra.end.y = 0.9;
    extra.labels.forEach((l) => (l.point.y = 0.89));
    extra.supports.forEach((s) => (s.point.y = 0.9));
    extra.dimensions = [];
    t.beamAssemblies = [...t.beamAssemblies!, extra].slice(0, count);
    const r = spatialBeamRecipe(t)!;
    expect(r.inputs.runs).toBe(count);
    for (const beam of t.beamAssemblies) {
      const layout = beamLayout(t, [beam, structuredClone(beam)]);
      expect(layout.supports).toHaveLength(4);
      expect(layout.spans).toHaveLength(3);
      expect(layout.spans[0].feet).toBe(beam === extra ? null : 8);
      expect(layout.spans[1].feet).toBeNull();
      expect(
        layout.supports.every(
          (s) => s.scopes[0] === "Requires scope confirmation",
        ),
      ).toBe(true);
    }
    expect(
      Object.keys(r.inputs).some((k) => /stock|pieces|length/.test(k)),
    ).toBe(false);
    expect(r.verified).toBe(false);
  },
);
it("retains conflicting spans, never sums them into run lengths, and blocks approval pending review", () => {
  const t = item(),
    b = t.beamAssemblies![0];
  b.dimensions.push({ ...b.dimensions[1], written: "9'-0\"" });
  const layout = beamLayout(t, [b]);
  expect(layout.spans[0].feet).toBeNull();
  expect(layout.spans[0].conflict).toBe(true);
  expect(layout.spans[0].dimensions).toHaveLength(2);
  expect(spatialBeamReviewProblem(t)).toContain("Conflicting support-span");
  expect(spatialBeamRecipe(t)!.inputs.length1).toBeUndefined();
});
it("keeps new, existing, by-others and conflicting support scopes distinct, with legacy compatibility", () => {
  const t = item(),
    b = t.beamAssemblies![0];
  b.supports[0].scope = "New work";
  b.supports[1].scope = "Existing work to remain";
  b.supports[2].scope = "By others / excluded";
  const repeated = structuredClone(b);
  repeated.supports[0].scope = "Existing work to remain";
  expect(validSpatialBeams([b, repeated])).toBe(true);
  const l = beamLayout(t, [b, repeated]);
  expect(l.supports).toHaveLength(4);
  expect(l.supports[0].scopes).toEqual(["New work", "Existing work to remain"]);
  expect(l.supports[2].scopes).toEqual(["By others / excluded"]);
  expect(
    validSpatialBeams([
      { ...b, supports: [{ ...b.supports[0], scope: "Invented" }] },
    ]),
  ).toBe(false);
});
it("does not interpret overall dimensions, off-line symbols or uncertain spacing as supported span lengths", () => {
  const t = item(),
    b = t.beamAssemblies![0];
  b.supports.push({ point: { x: 0.5, y: 0.9 }, evidence: "Unrelated symbol" });
  b.dimensions[1].association = "Uncertain";
  b.dimensions.push(fullDimension(b));
  const l = beamLayout(t, [b]);
  expect(l.supports).toHaveLength(4);
  expect(l.spans.every((s) => s.feet === null)).toBe(true);
});
it("does not mix support coordinates from another page's repeated view", () => {
  const t = item(),
    b = t.beamAssemblies![0],
    other = structuredClone(b);
  other.page = 2;
  other.supports[0].point = { x: 0.3, y: 0.3 };
  other.dimensions[1].written = "19'-0\"";
  const l = beamLayout(t, [b, other]);
  expect(l.supports).toHaveLength(4);
  expect(l.spans[0].feet).toBe(8);
});
it.each([0, 90, 180, 270])(
  "maps original drawing highlights through a %i degree viewer rotation",
  (rotation) => {
    const source = { x: 0.2, y: 0.3 };
    const mapped = rotatedDrawingPoint(source, rotation);
    const restored = rotatedDrawingPoint(mapped, 360 - rotation);
    expect(restored.x).toBeCloseTo(source.x);
    expect(restored.y).toBeCloseTo(source.y);
  },
);
it("does not turn nine support intervals times three plies into 27 purchasing boards", async () => {
  const { calculateMaterial } = await import("../shared/materialCalculators");
  const { beamStockGroups } = await import("../shared/beamLumber");
  const t = item(),
    r = spatialBeamRecipe(t)!;
  expect(
    t.beamAssemblies!.reduce((n, b) => n + beamLayout(t, [b]).spans.length, 0),
  ).toBe(9);
  expect(calculateMaterial(r, false).quantity).toBeNull();
  // Synthetic CONTRACTOR-approved full-length board layout, independently of spans.
  r.inputs.waste = 10;
  r.arrangements = {};
  for (const n of [1, 2, 3]) {
    Object.assign(r.inputs, {
      [`length${n}`]: n === 3 ? 16 : 12,
      [`stock${n}`]: n === 3 ? 16 : 12,
      [`pieces${n}`]: 1,
      [`layout${n}`]: 1,
    });
    r.arrangements[String(n)] =
      "Contractor verified continuous unspliced full-length boards; no offcut reuse.";
  }
  expect(calculateMaterial(r).quantity).toBeNull();
  r.verified = true;
  expect(calculateMaterial(r).quantity).toBe(11);
  expect(beamStockGroups(r).map((g) => [g.stock, g.base, g.quantity])).toEqual([
    [12, 6, 7],
    [16, 3, 4],
  ]);
  expect(t.status).toBe("Proposed");
});
it("preserves saved contractor edits and keeps the new layout metadata out of customer documents", async () => {
  const { seed } = await import("./model");
  const { customerDocument } = await import("./customerDocument");
  const t = item();
  t.beamAssemblies![0].supports[0].scope = "Existing work to remain";
  t.beamAssemblies![0].supports[0].evidence = "INTERNAL_SUPPORT_EVIDENCE_ONLY";
  t.calculation = {
    kind: "beam-runs",
    inputs: { runs: 1, length1: null, plies1: 4 },
    verified: true,
  };
  const before = structuredClone(t);
  beamLayout(t, t.beamAssemblies!);
  expect(t).toEqual(before);
  const q = seed().quotes[0];
  q.takeoff = [t];
  const publicJson = JSON.stringify(customerDocument(q));
  expect(publicJson).not.toContain("INTERNAL_SUPPORT_EVIDENCE_ONLY");
  expect(publicJson).not.toContain("beamAssemblies");
  expect(publicJson).not.toContain("calculation");
});
it("withholds a span dimension when its endpoints are equally plausible for another parallel beam", () => {
  const t = item(),
    b = t.beamAssemblies![0];
  b.dimensions[1].start.y = b.dimensions[1].end.y = 0.4;
  const span = beamLayout(t, [b]).spans[0];
  expect(span.ambiguousAssociation).toBe(true);
  expect(span.feet).toBeNull();
});
