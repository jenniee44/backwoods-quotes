import { it, expect, vi } from "vitest";
import {
  addAnalysisSuggestions,
  reviewTakeoff,
  approveTakeoff,
  editTakeoff,
  canConvert,
} from "./planAnalysis";
import {
  newQuote,
  defaults,
  newLine,
  takeoffToLine,
  calculate,
  migrate,
  seed,
} from "./model";
import { customerDocument } from "./customerDocument";
import { analysisFixture } from "../shared/analysis.fixture";
function quote() {
  const q = newQuote(defaults, []);
  q.documents = [
    {
      id: "plan",
      name: "private-plan.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64," + btoa("%PDF-1.7\n%%EOF"),
      addedAt: new Date().toISOString(),
    },
  ];
  return q;
}
it("AI creates Proposed items only, retains unknowns and never changes manual estimates or customer records", () => {
  const q = quote();
  q.lines = [{ ...newLine("Materials", defaults), cost: 20, quantity: 2 }];
  const before = calculate(q);
  const next = addAnalysisSuggestions(q, analysisFixture(), "fingerprint");
  expect(next.takeoff.every((t) => t.status === "Proposed")).toBe(true);
  expect(next.takeoff[0].quantity).toBeNull();
  expect(next.lines).toEqual(q.lines);
  expect(calculate(next)).toEqual(before);
  expect(next.customer).toEqual(q.customer);
  expect(() =>
    addAnalysisSuggestions(next, analysisFixture(), "fingerprint"),
  ).toThrow();
});
it("unknown and untouched low-confidence items cannot be bulk approved or converted", () => {
  const q = addAnalysisSuggestions(quote(), analysisFixture());
  const item = q.takeoff[0];
  expect(() => approveTakeoff(item)).toThrow();
  expect(() => reviewTakeoff(item)).toThrow();
  expect(canConvert(item)).toBe(false);
  expect(() => takeoffToLine(q, item, "Labour")).toThrow();
});
it("editing resets review; explicit review and approval allow one conversion with source and zero cost", () => {
  const q = addAnalysisSuggestions(quote(), analysisFixture());
  let item = editTakeoff(q.takeoff[0], { quantity: 3 });
  item = approveTakeoff(reviewTakeoff(item));
  q.takeoff[0] = item;
  const result = takeoffToLine(q, item, "Labour");
  expect(result.lines[0]).toMatchObject({
    quantity: 3,
    cost: 0,
    takeoffId: item.id,
    takeoffSource: { documentName: "private-plan.pdf", page: 1 },
  });
  expect(result.lines[0].pricingRequired).toBe(true);
  expect(() => takeoffToLine(result, result.takeoff[0], "Labour")).toThrow();
  expect(editTakeoff(item, { quantity: 4 }).status).toBe("Proposed");
  expect(editTakeoff(item, { quantity: 4 }).reviewAcknowledged).toBe(false);
});
it("rejects stale forged approval and keeps rejected/informational items out", () => {
  const q = addAnalysisSuggestions(quote(), analysisFixture());
  expect(() =>
    takeoffToLine(
      q,
      { ...q.takeoff[1], status: "Approved", reviewAcknowledged: true },
      "Materials",
    ),
  ).toThrow();
  expect(canConvert({ ...q.takeoff[1], status: "Rejected" })).toBe(false);
  expect(
    canConvert({
      ...q.takeoff[1],
      status: "Approved",
      destination: "Informational",
    }),
  ).toBe(false);
});
it("AI metadata survives reload/source removal but cannot enter customer document", () => {
  let q = addAnalysisSuggestions(quote(), analysisFixture(), "hash");
  q.takeoff[1] = approveTakeoff(reviewTakeoff(q.takeoff[1]));
  q = takeoffToLine(q, q.takeoff[1], "Materials");
  q.documents = [];
  q.takeoff = [];
  const store = seed();
  store.quotes = [q];
  expect(migrate(store).quotes[0].lines[0].takeoffSource!.documentName).toBe(
    "private-plan.pdf",
  );
  expect(JSON.stringify(customerDocument(q))).not.toMatch(
    /private-plan|confidence|VERIFY ON SITE|DO NOT SCALE|sourceDocument|takeoff|fingerprint/i,
  );
});

it("overlapping analysis does not duplicate retained facts and dimensions stay in the plan summary", () => {
  const first = addAnalysisSuggestions(quote(), analysisFixture(), "first");
  expect(first.analysisReports![0].dimensions![0].description).toBe(
    "Deck area",
  );
  expect(first.takeoff.some((item) => item.description === "Deck area")).toBe(
    false,
  );
  expect(first.takeoff.every((item) => item.status === "Proposed")).toBe(true);
  const second = addAnalysisSuggestions(first, analysisFixture(), "second");
  expect(second.takeoff).toHaveLength(first.takeoff.length);
});
it("rejects corrupted saved analysis metadata safely instead of crashing the review UI", () => {
  const q = addAnalysisSuggestions(quote(), analysisFixture());
  const store = seed();
  store.quotes = [q];
  (
    q.analysisReports![0].dimensions![0] as unknown as { confidence: unknown }
  ).confidence = { bad: true };
  expect(() => migrate(store)).toThrow("invalid");
});

it("browser network failures are understandable and do not disclose implementation details", async () => {
  const { planAnalysisService } = await import("./planAnalysis");
  vi.stubGlobal("fetch", async () => {
    throw new TypeError("internal transport stack");
  });
  try {
    await expect(
      planAnalysisService.analyze(quote().documents),
    ).rejects.toThrow("Check your connection");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("calculated takeoff provenance persists privately through conversion, reload and source removal", () => {
  const fixture = analysisFixture();
  Object.assign(fixture.suggestions[1], {
    scopeGroup: "Framing",
    specification: "INTERNAL_SPECIFICATION",
    location: "INTERNAL_LOCATION",
    sourceFacts: ["INTERNAL_SOURCE_FACT"],
    calculationBasis: "INTERNAL_CALCULATION_BASIS",
    quantityMethod: "Calculated",
    classification: "Calculated quantity",
    warnings: ["INTERNAL_WARNING"],
    assumptions: ["INTERNAL_ASSUMPTION"],
  });
  let q = addAnalysisSuggestions(quote(), fixture, "INTERNAL_FINGERPRINT");
  q.takeoff[1] = approveTakeoff(reviewTakeoff(q.takeoff[1]));
  q = takeoffToLine(q, q.takeoff[1], "Materials");
  q.lines[0].cost = 10; // Ensure non-zero customer row exercises projection.
  const source = q.lines[0].takeoffSource!;
  expect(source).toMatchObject({
    calculationBasis: "INTERNAL_CALCULATION_BASIS",
    sourceFacts: ["INTERNAL_SOURCE_FACT"],
    warnings: ["INTERNAL_WARNING"],
    classification: "Calculated quantity",
  });
  q.documents = [];
  q.takeoff = [];
  const store = seed();
  store.quotes = [q];
  const reloaded = migrate(store).quotes[0];
  expect(reloaded.lines[0].takeoffSource).toEqual(source);
  expect(JSON.stringify(customerDocument(reloaded))).not.toMatch(
    /INTERNAL_|private-plan|sourceFacts|sourcePage|calculationBasis|confidence|provenance|markup|profit|analysis/i,
  );
  expect(calculate(reloaded)).toEqual(calculate(q));
});
it("overlapping semantic facts are skipped without changing reviewed originals or collapsing distinct locations", () => {
  const fixture = analysisFixture();
  fixture.suggestions[1].description = "Concrete footings";
  fixture.suggestions[1].location = "Main deck";
  const first = addAnalysisSuggestions(quote(), fixture, "first");
  first.takeoff[1] = approveTakeoff(
    reviewTakeoff({ ...first.takeoff[1], scopeVerified: true }),
  );
  const original = structuredClone(first.takeoff);
  fixture.suggestions[1].description = "Concrete piers";
  const duplicate = addAnalysisSuggestions(first, fixture, "second");
  expect(duplicate.takeoff).toEqual(original);
  expect(duplicate.analysisReports!.at(-1)!.duplicatesReduced).toBe(2);
  fixture.suggestions[1].location = "Landing";
  const distinct = addAnalysisSuggestions(duplicate, fixture, "third");
  expect(distinct.takeoff).toHaveLength(original.length + 1);
  expect(distinct.takeoff.slice(0, original.length)).toEqual(original);
});
it("old saved estimates and analysis reports remain compatible and unchanged", () => {
  const q = quote();
  q.takeoff = [
    {
      id: "old",
      description: "Manual old takeoff",
      quantity: 2,
      unit: "each",
      documentId: "plan",
      page: 1,
      notes: "",
      confidence: "Low",
      status: "Reviewed",
    },
  ];
  q.analysisReports = [
    {
      id: "old-report",
      fingerprint: "old",
      createdAt: "2026-01-01",
      dimensions: analysisFixture().dimensions,
      project: analysisFixture().project,
      assumptions: [],
      warnings: [],
    },
  ];
  const store = seed();
  store.quotes = [q];
  const reloaded = migrate(store).quotes[0];
  expect(reloaded.takeoff).toEqual(q.takeoff);
  expect(reloaded.analysisReports).toEqual(q.analysisReports);
  expect(canConvert(reloaded.takeoff[0])).toBe(true);
});
it("editing calculation evidence resets approval and low confidence still requires explicit acknowledgement", () => {
  const q = addAnalysisSuggestions(quote(), analysisFixture());
  let item = editTakeoff(q.takeoff[0], {
    quantity: 4,
    calculationBasis: "Verified by contractor",
    sourceFacts: ["Reviewed source"],
  });
  expect(() => approveTakeoff(item)).toThrow();
  item = approveTakeoff(reviewTakeoff(item));
  expect(item.confidence).toBe("Low");
  const edited = editTakeoff(item, { calculationBasis: "Changed calculation" });
  expect(edited.status).toBe("Proposed");
  expect(canConvert(edited)).toBe(false);
});
it("corrupted saved evidence and summary are safely rejected", () => {
  const q = addAnalysisSuggestions(quote(), analysisFixture());
  const store = seed();
  store.quotes = [q];
  Object.assign(q.takeoff[0], { sourceFacts: "bad" });
  expect(() => migrate(store)).toThrow("invalid");
  q.takeoff[0].sourceFacts = [];
  Object.assign(q.analysisReports![0], { summary: { majorScope: "bad" } });
  expect(() => migrate(store)).toThrow("invalid");
});

it("deck observations yield specific candidates, preserve source evidence privately and retain pricing/review safeguards", async () => {
  const { deckTakeoffFixture } = await import("../shared/deckTakeoff.fixture");
  const input = quote();
  const originalPrice = calculate(input);
  let q = addAnalysisSuggestions(
    input,
    deckTakeoffFixture(),
    "deck-observations",
  );
  expect(q.takeoff).toHaveLength(5);
  expect(q.analysisReports![0].sourceObservations![2]).toMatchObject({
    specification: "2x6 PT deck joists @ 16 in. O.C.",
    confidence: "High",
    classification: "Plan fact",
  });
  expect(calculate(q)).toEqual(originalPrice);
  const posts = q.takeoff.find((item) => item.category === "Posts")!;
  const approved = approveTakeoff(reviewTakeoff(posts));
  q.takeoff = q.takeoff.map((item) =>
    item.id === approved.id ? approved : item,
  );
  q = takeoffToLine(q, approved, "Materials");
  expect(q.lines[0]).toMatchObject({
    description: "6x6 PT posts",
    quantity: 3,
    cost: 0,
    category: "Posts",
    pricingRequired: true,
  });
  expect(q.lines[0].takeoffSource).toMatchObject({
    sourceFacts: posts.sourceFacts,
    confidence: "High",
    specification: "6x6 PT posts",
    quantityMethod: "Counted",
  });
  expect(() => takeoffToLine(q, approved, "Materials")).toThrow();
  expect(() =>
    reviewTakeoff(q.takeoff.find((item) => item.category === "Joists")!),
  ).toThrow("missing quantity");
  const persisted = seed();
  persisted.quotes = [q];
  expect(migrate(persisted).quotes[0].analysisReports).toEqual(
    q.analysisReports,
  );
  expect(JSON.stringify(customerDocument(q))).not.toMatch(
    /sourceObservations|sourceFacts|supportBasis|scopeVerified|sourceDetailView|Counted|confidence|PRIVATE/,
  );
});
it("uncertain support inclusion cannot be reviewed, bulk-approved or forged into conversion before explicit verification", async () => {
  const { deckTakeoffFixture } = await import("../shared/deckTakeoff.fixture");
  const q = addAnalysisSuggestions(quote(), deckTakeoffFixture());
  const footing = q.takeoff.find(
    (item) => item.category === "Footings / concrete",
  )!;
  expect(footing).toMatchObject({
    quantity: 7,
    supportBasis: "Apparent new work",
    scopeVerified: false,
  });
  expect(() => reviewTakeoff(footing)).toThrow("contract scope");
  const forged = {
    ...footing,
    status: "Approved" as const,
    reviewAcknowledged: true,
  };
  expect(canConvert(forged)).toBe(false);
  q.takeoff = q.takeoff.map((item) => (item.id === forged.id ? forged : item));
  expect(() => takeoffToLine(q, forged, "Materials")).toThrow(
    "scope inclusion",
  );
  const verified = editTakeoff(footing, {
    workScope: "New work",
    included: true,
    scopeVerified: true,
  });
  const approved = approveTakeoff(
    reviewTakeoff(editTakeoff(verified, { scopeVerified: true })),
  );
  expect(canConvert(approved)).toBe(true);
  expect(editTakeoff(approved, { quantity: 8 })).toMatchObject({
    status: "Proposed",
    reviewAcknowledged: false,
    scopeVerified: false,
  });
  expect(() =>
    approveTakeoff(editTakeoff(approved, { scopeVerified: false })),
  ).toThrow("scope inclusion");
});
it("readable specification and detail-view provenance survive quantity entry, approval and zero-price conversion", async () => {
  const { deckTakeoffFixture } = await import("../shared/deckTakeoff.fixture");
  const data = deckTakeoffFixture();
  data.sourceObservations![2].sourceDetailView = 3;
  let q = addAnalysisSuggestions(quote(), data);
  const joists = q.takeoff.find((item) => item.category === "Joists")!;
  expect(joists).toMatchObject({
    quantity: null,
    specification: "2x6 PT deck joists @ 16 in. O.C.",
    sourceDetailView: 3,
    confidence: "Low",
  });
  const entered = editTakeoff(joists, { quantity: 18 });
  const approved = approveTakeoff(reviewTakeoff(entered));
  q.takeoff = q.takeoff.map((item) =>
    item.id === approved.id ? approved : item,
  );
  q = takeoffToLine(q, approved, "Materials");
  expect(q.lines[0].description).toContain("2x6 PT deck joists @ 16 in. O.C.");
  expect(q.lines[0].takeoffSource).toMatchObject({
    sourceDetailView: 3,
    specification: joists.specification,
    confidence: "Low",
    sourceFacts: joists.sourceFacts,
  });
  expect(q.lines[0].cost).toBe(0);
});
