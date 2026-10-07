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

it("overlapping analysis does not duplicate retained facts and informational dimensions remain Proposed", () => {
  const first = addAnalysisSuggestions(quote(), analysisFixture(), "first");
  expect(first.takeoff.at(-1)).toMatchObject({
    destination: "Informational",
    status: "Proposed",
  });
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
