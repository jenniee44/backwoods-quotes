import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { analysisFixture } from "../shared/analysis.fixture";
import { validateAnalysis, analysisSchema } from "../shared/analysis";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
import { seed, migrate } from "./model";
import { addAnalysisSuggestions } from "./planAnalysis";
import { materialTakeoffProposal, prepareDeckTakeoff } from "./deckTakeoff";
import BeamAssemblySummary from "./BeamAssemblySummary";
import type { BeamLayoutEntry } from "../shared/beamLayoutInventory";
import { spatialBeamRecipe } from "./spatialBeamPrefill";
import { calculateMaterial } from "../shared/materialCalculators";
const quote = () => ({
  ...seed().quotes[0],
  takeoff: [],
  documents: [
    {
      id: "synthetic",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0=",
      addedAt: "2026-01-01",
    },
  ],
});
const entries = (count: number): BeamLayoutEntry[] =>
  Array.from({ length: count }, (_, i) => {
    const beam = structuredClone(syntheticDeckBeams()[0]);
    const y = 0.15 + i * 0.1;
    beam.start.y = y;
    beam.end.y = y;
    beam.labels.forEach((l) => (l.point.y = y));
    beam.supports.forEach((s) => (s.point.y = y));
    return {
      ...beam,
      view: "Framing plan",
      documentId: "synthetic",
      location: "Independent framing layout",
      sourceDetailView: null,
      drawingLabel: "",
      scope: "Requires scope confirmation",
      dimensions: [],
    };
  });
function response(inventory: BeamLayoutEntry[]) {
  const r = analysisFixture("synthetic");
  r.suggestions = [];
  r.dimensions = [];
  r.sourceObservations = [];
  r.beamLayoutInventory = inventory;
  return r;
}
for (const count of [1, 2, 3, 4, 5])
  it(`inventories ${count} physical plan lines without a quantity/label prerequisite`, () => {
    const r = validateAnalysis(response(entries(count)), ["synthetic"]);
    expect(r.beamLayoutInventory).toBeUndefined();
    expect(r.suggestions).toHaveLength(1);
    expect(r.sourceObservations).toHaveLength(count);
    const q = prepareDeckTakeoff(addAnalysisSuggestions(quote(), r));
    const t = q.takeoff.find(
      (t) => t.status !== "Rejected" && t.category === "Beams",
    )!;
    expect(t.beamAssemblies).toHaveLength(count);
    expect(materialTakeoffProposal(t)).toMatchObject({
      quantity: count,
      unit: "runs",
      purchase: null,
    });
    expect(t.calculation?.inputs.runs).toBe(count);
    for (let i = 1; i <= count; i++) {
      expect(t.calculation?.inputs[`plies${i}`]).toBe(3);
      expect(t.calculation?.inputs[`length${i}`]).toBeUndefined();
      expect(t.calculation?.inputs[`stock${i}`]).toBeUndefined();
    }
    expect(calculateMaterial(t.calculation!).quantity).toBeNull();
    const html = renderToStaticMarkup(
      createElement(BeamAssemblySummary, { item: t }),
    );
    expect(html.match(/class="beam-line-summary"/g) ?? []).toHaveLength(count);
    expect(html).toContain(`${count} proposed beam`);
    const store = seed();
    store.quotes = [q];
    expect(
      migrate(JSON.parse(JSON.stringify(store))).quotes[0].takeoff.find(
        (t) => t.id === t.id,
      )?.beamAssemblies,
    ).toHaveLength(count);
  });
it("schema explicitly requests beam layout before material suggestions", () => {
  expect(analysisSchema.required).toContain("beamLayoutInventory");
  expect(
    analysisSchema.properties.beamLayoutInventory.items.required,
  ).toContain("view");
});
it("overlapping crops and repeated specification labels corroborate rather than multiply physical runs", () => {
  const a = entries(3),
    repeat = structuredClone(a[1]);
  repeat.evidence += "; repeated crop of same physical beam";
  a.forEach((b) => b.labels.push(structuredClone(b.labels[0])));
  const r = validateAnalysis(response([...a, repeat]), ["synthetic"]);
  const q = prepareDeckTakeoff(addAnalysisSuggestions(quote(), r));
  const t = q.takeoff.find(
    (t) => t.status !== "Rejected" && t.category === "Beams",
  )!;
  expect(spatialBeamRecipe(t)?.inputs.runs).toBe(3);
  expect(q.analysisReports![0].sourceObservations).toHaveLength(4);
});
it("a clear detail does not replace missing physical plan geometry or inflate its count", () => {
  const detail = {
    ...entries(1)[0],
    view: "Connection detail" as const,
    location: "Connection detail",
  };
  const r = validateAnalysis(response([...entries(3), detail]), ["synthetic"]);
  const q = prepareDeckTakeoff(addAnalysisSuggestions(quote(), r));
  const plan = q.takeoff.find(
    (t) => t.destination === "Materials" && t.status !== "Rejected",
  )!;
  expect(materialTakeoffProposal(plan).quantity).toBe(3);
  expect(
    q.analysisReports![0].sourceObservations?.some(
      (t) => t.beamAssemblies?.[0].view === "Connection detail",
    ),
  ).toBe(true);
  expect(
    r.suggestions.filter((s) => s.destination === "Materials"),
  ).toHaveLength(1);
});
it("source/page/crop validation and finite geometry remain enforced", () => {
  for (const patch of [
    { documentId: "unknown" },
    { page: 51 },
    { sourceDetailView: 25 },
    { view: "guess" },
  ])
    expect(() =>
      validateAnalysis(
        response([{ ...entries(1)[0], ...patch } as BeamLayoutEntry]),
        ["synthetic"],
      ),
    ).toThrow();
  const r = response(entries(1));
  r.beamLayoutInventory![0].start.x = NaN;
  expect(() => validateAnalysis(r, ["synthetic"])).toThrow();
});
it("shows written spans and their uncertainty separately without producing full-run lengths", () => {
  const inventory = entries(3),
    b = inventory[2];
  b.dimensions = [
    {
      written: "9'-2\"±",
      role: "Support spacing",
      association: "Explicit endpoints",
      start: { ...b.supports[0].point },
      end: { ...b.supports[1].point },
      evidence: "Written approximate span between these support anchors",
    },
    {
      written: "28'-0\"",
      role: "Overall",
      association: "Uncertain",
      start: b.start,
      end: b.end,
      evidence:
        "Deck boundary dimension; endpoints not associated with complete beam",
    },
  ];
  const r = validateAnalysis(response(inventory), ["synthetic"]),
    q = prepareDeckTakeoff(addAnalysisSuggestions(quote(), r));
  const t = q.takeoff[0],
    html = renderToStaticMarkup(
      createElement(BeamAssemblySummary, { item: t }),
    );
  expect(html).toContain(
    "Written dimensions: Support spacing: 9&#x27;-2&quot;±",
  );
  expect(html).toContain("association to confirm");
  expect(html).toContain("Missing: a written full-run dimension");
  expect(t.calculation?.inputs.length3).toBeUndefined();
  expect(materialTakeoffProposal(t).purchase).toBeNull();
});
it("a full endpoint-associated length on an unlabelled plan beam is preserved only on that run", async () => {
  const { fullDimension } = await import("../shared/spatialBeam.fixture");
  const inventory = entries(3);
  inventory[1].dimensions = [fullDimension(inventory[1], "14'-0\"")];
  const q = prepareDeckTakeoff(
    addAnalysisSuggestions(
      quote(),
      validateAnalysis(response(inventory), ["synthetic"]),
    ),
  );
  expect(q.takeoff[0].calculation?.inputs.length2).toBe(14);
  expect(q.takeoff[0].calculation?.inputs.length1).toBeUndefined();
  expect(q.takeoff[0].calculation?.inputs.length3).toBeUndefined();
  expect(materialTakeoffProposal(q.takeoff[0]).purchase).toBeNull();
});
for (const turn of [0, 90, 180, 270])
  it(`preserves distinct runs and support anchors in original-page coordinates after a ${turn} degree view rotation`, () => {
    const inventory = entries(3);
    const map = (p: { x: number; y: number }) =>
      turn === 90
        ? { x: p.y, y: 1 - p.x }
        : turn === 180
          ? { x: 1 - p.x, y: 1 - p.y }
          : turn === 270
            ? { x: 1 - p.y, y: p.x }
            : p;
    for (const b of inventory) {
      b.start = map(b.start);
      b.end = map(b.end);
      b.labels.forEach((l) => (l.point = map(l.point)));
      b.supports.forEach((s) => (s.point = map(s.point)));
    }
    const q = prepareDeckTakeoff(
      addAnalysisSuggestions(
        quote(),
        validateAnalysis(response(inventory), ["synthetic"]),
      ),
    );
    const t = q.takeoff[0];
    expect(t.calculation?.inputs.runs).toBe(3);
    expect(t.beamAssemblies?.every((b) => b.supports.length === 4)).toBe(true);
    expect(materialTakeoffProposal(t).purchase).toBeNull();
  });
it("a one-line material observation cannot duplicate or suppress the complete plan inventory", () => {
  const r = response(entries(3));
  r.suggestions = [
    {
      ...analysisFixture("synthetic").suggestions[1],
      description: "Primary timber beam",
      specification: "3PLY 2X10 PT",
      category: "Beams",
      location: "Different wording for same physical source",
      quantity: 1,
      unit: "each",
      beamAssemblies: [structuredClone(r.beamLayoutInventory![0])],
    },
  ];
  // Source metadata belongs to the inventory record, not its SpatialBeam payload.
  const {
    documentId: _documentId,
    sourceDetailView: _sourceDetailView,
    location: _location,
    ...beam
  } = r.beamLayoutInventory![0];
  void _documentId;
  void _sourceDetailView;
  void _location;
  r.suggestions[0].beamAssemblies = [beam];
  const normalized = validateAnalysis(r, ["synthetic"]);
  expect(normalized.suggestions).toHaveLength(1);
  expect(normalized.sourceObservations?.some((s) => s.quantity === 1)).toBe(
    true,
  );
  const q = prepareDeckTakeoff(addAnalysisSuggestions(quote(), normalized));
  expect(materialTakeoffProposal(q.takeoff[0])).toMatchObject({
    quantity: 3,
    unit: "runs",
    purchase: null,
  });
  expect(q.takeoff[0].beamAssemblies).toHaveLength(3);
});
