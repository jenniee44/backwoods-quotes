import { expect, it } from "vitest";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
import { proposedBeamRecipe, enrichBeamRecipe } from "./beamPrefill";
import {
  spatialBeamLength,
  spatialBeamReviewProblem,
} from "./spatialBeamPrefill";
import {
  uniqueSpatialBeams,
  validSpatialBeams,
  fullBeamDimension,
} from "../shared/spatialBeams";
import { seed, type TakeoffItem, takeoffToLine, migrate } from "./model";
import { prepareDeckTakeoff, materialTakeoffProposal } from "./deckTakeoff";
import { addAnalysisSuggestions } from "./planAnalysis";
import { analysisFixture } from "../shared/analysis.fixture";
import { validateAnalysis, validateDocuments } from "../shared/analysis";
import { completenessProblem } from "./takeoffRequirements";
import { customerDocument } from "./customerDocument";
const item = (): TakeoffItem => ({
  id: "spatial-deck",
  documentId: "plan",
  sourceDocumentName: "Synthetic deck.pdf",
  page: 1,
  description: "Deck beams",
  specification: "3PLY 2X10 PT",
  location: "Deck A",
  quantity: null,
  unit: "runs",
  notes: "New work",
  origin: "ai",
  destination: "Materials",
  category: "Beams",
  classification: "Contractor input required",
  confidence: "High",
  status: "Proposed",
  workScope: "New work",
  included: true,
  sourceFacts: [
    "Foundation & Deck Framing Plan S1.0, visual physical beam lines",
  ],
  beamAssemblies: syntheticDeckBeams(),
});
it("counts three physical beam lines, not nine repeated labels; parses plies and preserves all label references", () => {
  const t = item(),
    r = proposedBeamRecipe(t)!;
  expect(r.inputs).toEqual({ runs: 3, plies1: 3, plies2: 3, plies3: 3 });
  expect(t.beamAssemblies!.flatMap((b) => b.labels)).toHaveLength(9);
  expect(materialTakeoffProposal({ ...t, calculation: r })).toMatchObject({
    quantity: 3,
    unit: "runs",
    purchase: null,
  });
  expect(r.verified).toBe(false);
  expect(r.inputs.stock1).toBeUndefined();
  expect(r.arrangements).toEqual({});
});
it("never applies 24ft3 overall or support spans as full cut lengths", () => {
  const t = item(),
    r = proposedBeamRecipe(t)!;
  for (const b of t.beamAssemblies!)
    for (const d of b.dimensions) expect(fullBeamDimension(b, d)).toBe(false);
  expect([r.inputs.length1, r.inputs.length2, r.inputs.length3]).toEqual([
    undefined,
    undefined,
    undefined,
  ]);
});
it("prefills only the explicitly associated full beam length, retaining original reference", () => {
  const t = item();
  t.beamAssemblies![1].dimensions.push(
    fullDimension(t.beamAssemblies![1], "14'-6\""),
  );
  const r = proposedBeamRecipe(t)!;
  expect(r.inputs.length2).toBe(14.5);
  expect(r.inputs.length1).toBeUndefined();
  expect(r.inputs.length3).toBeUndefined();
  expect(r.lengthSources!["2"]).toContain("S1.0");
  expect(r.lengthSources!["2"]).toContain("page 1");
  expect(r.inputs.stock2).toBeUndefined();
  expect(r.arrangements!["2"]).toBeUndefined();
});
it("rejects misleading roles, ambiguous associations and endpoints for a partial span", () => {
  const t = item(),
    b = t.beamAssemblies![0];
  for (const d of [
    { ...fullDimension(b), role: "Uncertain" as const },
    { ...fullDimension(b), association: "Uncertain" as const },
    { ...fullDimension(b), end: { x: 0.4, y: 0.27 } },
    { ...fullDimension(b), evidence: "Overall deck width" },
  ]) {
    b.dimensions = [d];
    expect(spatialBeamLength(t, [b])).toBeNull();
  }
});
it("preserves conflicting lengths and blocks approval until contractor reconciliation", () => {
  const t = item(),
    a = t.beamAssemblies![0];
  a.dimensions.push(fullDimension(a));
  const b = structuredClone(a);
  b.dimensions = [fullDimension(b, "14'-0\"")];
  t.beamAssemblies!.push(b);
  expect(proposedBeamRecipe(t)!.inputs.runs).toBe(3);
  expect(proposedBeamRecipe(t)!.inputs.length1).toBeUndefined();
  expect(uniqueSpatialBeams(t.beamAssemblies!)[0]).toHaveLength(2);
  expect(completenessProblem(t)).toContain("Conflicting full beam lengths");
});
it("consolidates repeated geometry without adding quantities or removing source observations", () => {
  const t = item(),
    copy = structuredClone(t.beamAssemblies![0]);
  copy.evidence =
    "Repeated physical beam reference, second drawing observation";
  copy.labels.push({ text: "3PLY 2X10 PT", point: { x: 0.25, y: 0.29 } });
  t.beamAssemblies!.push(copy);
  const before = structuredClone(t);
  expect(proposedBeamRecipe(t)!.inputs.runs).toBe(3);
  expect(t).toEqual(before);
  expect(t.beamAssemblies).toHaveLength(4);
});
it("does not merge nearby parallel lines, different scopes or different specifications", () => {
  const b = syntheticDeckBeams()[0];
  expect(
    uniqueSpatialBeams([
      b,
      { ...b, start: { x: 0.2, y: 0.301 }, end: { x: 0.8, y: 0.301 } },
      { ...b, scope: "By others / excluded" },
      { ...b, specification: "2PLY 2X8 PT" },
    ]),
  ).toHaveLength(4);
});
it("requires review of overlapping partial segments instead of counting them as additional beams", () => {
  const t = item(),
    b = structuredClone(t.beamAssemblies![0]);
  b.end.x = 0.6;
  t.beamAssemblies!.push(b);
  expect(proposedBeamRecipe(t)).toBeNull();
  expect(spatialBeamReviewProblem(t)).toContain("overlapping beam segments");
});
it("keeps existing and by-others beams out of automatic calculations", () => {
  const t = item();
  t.beamAssemblies![1].scope = "Existing work to remain";
  t.beamAssemblies![2].scope = "By others / excluded";
  expect(proposedBeamRecipe(t)!.inputs.runs).toBe(1);
  t.beamAssemblies![0].scope = "Requires scope confirmation";
  expect(proposedBeamRecipe(t)).toBeNull();
});
it("does not count ambiguous geometry or unrelated labels as reliable beam lines", () => {
  const t = item();
  t.beamAssemblies![1].labels = [{ text: "LUS26", point: { x: 0.4, y: 0.1 } }];
  expect(proposedBeamRecipe(t)).toBeNull();
  t.beamAssemblies![1].labels = [{ text: "LUS26", point: { x: 0.4, y: 0.49 } }];
  expect(proposedBeamRecipe(t)).toBeNull();
});
it("fills saved fields by drawing label rather than response order, preserving manual values and intentional blanks", () => {
  const t = item();
  t.beamAssemblies!.forEach((b, i) => {
    b.drawingLabel = `B${i + 1}`;
    b.dimensions.push(fullDimension(b, `${12 + i}'-0"`));
  });
  const recipe = {
    kind: "beam-runs",
    inputs: { runs: 3, length1: 20, length2: null },
    runLabels: { "1": "B3", "2": "B2", "3": "B1" },
    verified: false,
  };
  const r = enrichBeamRecipe(t, recipe);
  expect(r.inputs).toMatchObject({
    length1: 20,
    length2: null,
    length3: 12,
    plies1: 3,
    plies2: 3,
    plies3: 3,
  });
  expect(r.verified).toBe(false);
  const q = {
    ...seed().quotes[0],
    status: "Draft" as const,
    takeoff: [{ ...t, calculation: recipe }],
  };
  expect(prepareDeckTakeoff(prepareDeckTakeoff(q))).toEqual(
    prepareDeckTakeoff(q),
  );
  expect(enrichBeamRecipe(t, { ...recipe, verified: true })).toEqual({
    ...recipe,
    verified: true,
  });
});
it("preserves old saved analyses without spatial data", () => {
  const store = seed(),
    q = store.quotes[0];
  const t = item();
  delete t.beamAssemblies;
  t.calculation = {
    kind: "beam-runs",
    inputs: { runs: 3, length1: null, plies1: 2 },
    verified: false,
  };
  q.takeoff = [t];
  const loaded = migrate(structuredClone(store));
  expect(loaded.quotes[0].takeoff[0]).toEqual(t);
  expect(
    prepareDeckTakeoff({ ...loaded.quotes[0], status: "Draft" }).takeoff[0]
      .calculation!.inputs,
  ).toMatchObject({ runs: 3, length1: null, plies1: 2 });
});
it("normalizes new structured geometry, preserves references and prevents conversion without approval", () => {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.documents = [
    {
      id: "plan",
      name: "Synthetic deck.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF"),
      addedAt: new Date().toISOString(),
    },
  ];
  const fixture = analysisFixture();
  fixture.suggestions = [
    {
      ...fixture.suggestions[1],
      ...item(),
      beamAssemblies: item().beamAssemblies,
    },
  ];
  // Provider candidates contain no app-only fields.
  const raw = fixture.suggestions[0] as unknown as Record<string, unknown>;
  for (const key of [
    "id",
    "status",
    "origin",
    "included",
    "workScope",
    "sourceDocumentName",
  ])
    delete raw[key];
  fixture.suggestions[0].quantity = 9;
  fixture.suggestions[0].quantityMethod = "Counted";
  fixture.suggestions.push(structuredClone(fixture.suggestions[0]));
  fixture.suggestions[1].sourceFacts = [
    "Second source observation of physical framing plan",
  ];
  const validated = validateAnalysis(fixture, ["plan"]);
  expect(validated.suggestions).toHaveLength(1);
  expect(validated.suggestions[0].quantity).toBeNull();
  const added = addAnalysisSuggestions(q, validated, "spatial");
  const t = added.takeoff[0];
  expect(t.calculation!.inputs.runs).toBe(3);
  expect(t.sourceFacts!.join(" ")).toContain("Second source observation");
  expect(t.status).toBe("Proposed");
  expect(() => takeoffToLine(added, t, "Materials")).toThrow();
  expect(JSON.stringify(customerDocument(added))).not.toMatch(
    /beamAssemblies|SpatialBeam|physical framing plan|positions|Foundation & Deck Framing Plan/,
  );
});
it("validates spatial bounds, limits and physical pages without accepting approval metadata", () => {
  const beams = syntheticDeckBeams();
  expect(validSpatialBeams(beams)).toBe(true);
  expect(validSpatialBeams([{ ...beams[0], start: { x: -1, y: 0 } }])).toBe(
    false,
  );
  expect(validSpatialBeams([{ ...beams[0], approved: true }])).toBe(false);
  expect(validSpatialBeams(Array.from({ length: 21 }, () => beams[0]))).toBe(
    false,
  );
  const r = analysisFixture();
  r.suggestions[1].beamAssemblies = [{ ...beams[0], page: 2 }];
  const docs = validateDocuments([
    {
      id: "plan",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF"),
      pdfText: { pageCount: 1, truncated: false, pages: [] },
    },
  ]);
  expect(() => validateAnalysis(r, ["plan"], docs)).toThrow();
});
it("withholds a full dimension associated to the wrong parallel beam or equally close lines", () => {
  const t = item(),
    b = t.beamAssemblies![0],
    second = t.beamAssemblies![1];
  b.dimensions = [
    {
      ...fullDimension(b),
      start: { x: 0.2, y: 0.47 },
      end: { x: 0.8, y: 0.47 },
    },
  ];
  expect(spatialBeamLength(t, [b])).toBeNull();
  b.dimensions = [
    { ...fullDimension(b), start: { x: 0.2, y: 0.4 }, end: { x: 0.8, y: 0.4 } },
  ];
  expect(spatialBeamLength(t, [b])).toBeNull();
  b.dimensions = [fullDimension(b)];
  expect(spatialBeamLength(t, [b])!.feet).toBe(12);
  second.supports = [
    {
      point: { x: 0.2, y: 0.3 },
      evidence: "Support may belong to another beam",
    },
  ];
  expect(proposedBeamRecipe(t)).toBeNull();
});
it("never persists a derived calculator outside existing numeric bounds", () => {
  const t = item();
  t.beamAssemblies![0].dimensions = [
    fullDimension(t.beamAssemblies![0], "9999999999 ft"),
  ];
  expect(proposedBeamRecipe(t)).toBeNull();
  const plies = item();
  const spec = "9".repeat(80) + "PLY 2X10 PT";
  plies.beamAssemblies![0].specification = spec;
  plies.beamAssemblies![0].labels[0].text = spec;
  expect(proposedBeamRecipe(plies)).toBeNull();
});
