import { customerDocument } from "./customerDocument";
import { it, expect } from "vitest";
import { seed, takeoffToLine, migrate } from "./model";
import type { TakeoffItem } from "./model";
import {
  overlappingItems,
  unresolvedOverlaps,
  acknowledgeSeparate,
  consolidateCompared,
} from "./takeoffOverlap";
import { assertScope } from "./takeoffScope";
import { approveTakeoffBatch } from "./planAnalysis";
const item = (id: string, delta: Partial<TakeoffItem> = {}): TakeoffItem => ({
  id,
  description: "3-ply 2x10 beam",
  specification: "3-ply 2x10 PT",
  quantity: 2,
  unit: "each",
  documentId: "synthetic",
  page: 1,
  notes: "Synthetic source",
  confidence: "High",
  status: "Proposed",
  destination: "Materials",
  location: "Rear deck",
  ...delta,
});
it("flags beam and guard comparisons without merging and blocks single, bulk and conversion approval", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [
    item("a"),
    item("b"),
    item("c", { description: "Deck guard" }),
    item("d", { description: "Guard railing" }),
    item("e", { description: "Deck guard by others", workScope: "By others" }),
  ];
  expect(overlappingItems(q, q.takeoff[0])).toHaveLength(1);
  expect(overlappingItems(q, q.takeoff[2])).toHaveLength(2);
  expect(() => assertScope(q, q.takeoff[0])).toThrow("Compare");
  q.takeoff[0] = {
    ...q.takeoff[0],
    status: "Reviewed",
    reviewAcknowledged: true,
  };
  expect(() => approveTakeoffBatch(q, [q.takeoff[0]])).toThrow("Compare");
  expect(() =>
    takeoffToLine(q, { ...q.takeoff[0], status: "Approved" }, "Materials"),
  ).toThrow("Compare");
});
it("contractor-confirmed separate records stay separate; critical edits invalidate comparison", () => {
  const q = seed().quotes[0];
  q.takeoff = [
    item("a"),
    item("b", { location: "Front deck", workScope: "By others" }),
  ];
  const next = acknowledgeSeparate(
    q,
    ...(q.takeoff as [TakeoffItem, TakeoffItem]),
  );
  expect(next.takeoff).toHaveLength(2);
  expect(unresolvedOverlaps(next, next.takeoff[0])).toHaveLength(0);
  next.takeoff[1] = { ...next.takeoff[1], specification: "Different stock" };
  expect(unresolvedOverlaps(next, next.takeoff[0])).toHaveLength(1);
});
it("confirmed consolidation preserves full rejected source and references without adding quantities", () => {
  const q = seed().quotes[0];
  q.takeoff = [
    item("a"),
    item("b", {
      documentId: "second",
      page: 2,
      sourceFacts: ["Readable beam callout"],
    }),
  ];
  const next = consolidateCompared(
    q,
    ...(q.takeoff as [TakeoffItem, TakeoffItem]),
  );
  expect(next.takeoff[0].quantity).toBe(2);
  expect(next.takeoff[0].sourceFacts?.join()).toContain("second");
  expect(next.takeoff[1]).toEqual({
    ...q.takeoff[1],
    status: "Rejected",
    reviewAcknowledged: false,
  });
  expect(q.takeoff[1].status).toBe("Proposed");
});
it("refuses different specifications, locations, methods, by-others scope and reviewed records", () => {
  const q = seed().quotes[0];
  for (const delta of [
    { specification: "2x8" },
    { location: "Front" },
    { alternativeOption: "steel" },
    { workScope: "By others" as const },
    { status: "Reviewed" as const },
    { quantity: 3 },
  ]) {
    q.takeoff = [item("a"), item("b", delta)];
    expect(() =>
      consolidateCompared(q, ...(q.takeoff as [TakeoffItem, TakeoffItem])),
    ).toThrow();
  }
});

it("comparison decisions survive storage privately and retain long source evidence safely", () => {
  const store = seed();
  const q = store.quotes[0];
  q.takeoff = [
    item("a", {
      sourceFacts: Array.from(
        { length: 20 },
        (_, i) => String(i) + "x".repeat(990),
      ),
    }),
    item("b"),
  ];
  store.quotes = [acknowledgeSeparate(q, q.takeoff[0], q.takeoff[1])];
  expect(migrate(store).quotes[0].takeoff[0].overlapReviews).toHaveLength(1);
  expect(JSON.stringify(customerDocument(store.quotes[0]))).not.toMatch(
    /overlapReviews|Synthetic source|sourceFacts/,
  );
});

it("blocks duplicate physical concrete footing counts until contractor comparison; consolidation preserves both observations without summing", () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  q.takeoff = [
    item("footing-a", {
      description: "Concrete footings",
      specification: "12 inch concrete footings",
      quantity: 12,
      location: "Rear deck",
      page: 1,
    }),
    item("footing-b", {
      description: "Concrete pier footing assemblies",
      specification: "12 inch concrete footings",
      quantity: 12,
      location: "Rear deck",
      page: 2,
    }),
  ];
  expect(unresolvedOverlaps(q, q.takeoff[0])).toHaveLength(1);
  expect(() => assertScope(q, q.takeoff[0])).toThrow("Compare");
  expect(() =>
    takeoffToLine(
      q,
      { ...q.takeoff[0], status: "Approved", reviewAcknowledged: true },
      "Materials",
    ),
  ).toThrow("Compare");
  const consolidated = consolidateCompared(q, q.takeoff[0], q.takeoff[1]);
  expect(
    consolidated.takeoff.filter((t) => t.status !== "Rejected"),
  ).toHaveLength(1);
  expect(consolidated.takeoff[0].quantity).toBe(12);
  expect(consolidated.takeoff[1].page).toBe(2);
  expect(consolidated.takeoff[0].sourceFacts?.join()).toContain("page 2");
  const separate = acknowledgeSeparate(q, q.takeoff[0], {
    ...q.takeoff[1],
    location: "Front deck",
  });
  expect(separate.takeoff).toHaveLength(2);
});
