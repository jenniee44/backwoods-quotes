import { expect, it } from "vitest";
import {
  prepareMaterialsSummary,
  summaryApprovalProblem,
  approveSummaryMaterials,
  sendShoppingList,
} from "./materialsSummary";
import { newQuote, defaults, calculate } from "./model";
import type { TakeoffItem } from "./model";
import {
  applyQuickMaterialChanges,
  quickMaterialChanges,
  quickMaterialDraft,
} from "./quickMaterialEdit";
const item = (delta: Partial<TakeoffItem> = {}): TakeoffItem => ({
  id: "a",
  description: "Aluminum ledger flashing",
  specification: "Aluminum Z flashing",
  quantity: 20,
  unit: "ft",
  documentId: "synthetic",
  page: 1,
  notes: "New work",
  status: "Proposed",
  origin: "ai",
  confidence: "High",
  destination: "Materials",
  category: "Miscellaneous",
  workScope: "New work",
  included: true,
  location: "Rear ledger",
  ...delta,
});
const quote = (items = [item()]) => ({
  ...newQuote(defaults, []),
  takeoff: items,
});
it("consolidates equivalent observations without adding quantities and preserves sources", () => {
  const a = item({
    category: "Joists",
    description: "Deck joists",
    specification: "2x6 PT",
    quantity: 12,
    unit: "boards",
  });
  const result = prepareMaterialsSummary([
    a,
    { ...a, id: "b", page: 2, sourceFacts: ["second drawing detail"] },
  ]);
  expect(result).toHaveLength(1);
  expect(result[0].quantity).toBe(12);
  expect(result[0].sourceFacts?.join(" ")).toContain("second drawing detail");
});
it("keeps different quantities, locations, methods and specifications separate", () => {
  const a = item();
  for (const delta of [
    { quantity: 21 },
    { location: "Front ledger" },
    { specification: "Copper flashing" },
    { alternativeOption: "Different method" },
  ]) {
    expect(
      prepareMaterialsSummary([a, item({ id: "b", ...delta })]),
    ).toHaveLength(2);
  }
});
it("only calculates from complete explicitly verified recipes", () => {
  const a = item({
    description: "Deck area",
    quantity: null,
    unit: "sq ft",
    calculation: {
      kind: "area",
      inputs: { length: 12, width: 10, waste: 0 },
      verified: false,
    },
  });
  expect(prepareMaterialsSummary([a])[0].quantity).toBeNull();
  // Use an existing supported calculator; no stock/waste inputs are inferred.
  const c = item({
    quantity: null,
    calculation: {
      kind: "rectangular-concrete",
      inputs: { count: 1, padLength: 36, padWidth: 36, depth: 12, waste: 0 },
      verified: true,
    },
  });
  expect(prepareMaterialsSummary([c])[0].quantity).toBeCloseTo(1 / 3);
  expect(
    prepareMaterialsSummary([
      {
        ...c,
        calculation: {
          ...c.calculation!,
          inputs: { ...c.calculation!.inputs, depth: null },
        },
      },
    ])[0].quantity,
  ).toBeNull();
});
it("requires explicit contractor acknowledgement for bulk approval", () => {
  const q = quote();
  expect(() => approveSummaryMaterials(q, ["a"], false)).toThrow("Confirm");
  const next = approveSummaryMaterials(q, ["a"], true);
  expect(next.takeoff[0]).toMatchObject({
    status: "Approved",
    reviewAcknowledged: true,
  });
  expect(q.takeoff[0].status).toBe("Proposed");
});
it("rejects incomplete, conflicting, excluded or stale batch selections atomically", () => {
  for (const delta of [
    { quantity: null },
    { specification: "unreadable" },
    { workScope: "Existing work to remain" as const },
    { included: false },
    { status: "Rejected" as const },
  ]) {
    const q = quote([item(), item({ id: "b", ...delta })]);
    expect(summaryApprovalProblem(q, q.takeoff[1])).not.toBe("");
    expect(() => approveSummaryMaterials(q, ["a", "b"], true)).toThrow();
    expect(q.takeoff[0].status).toBe("Proposed");
  }
  expect(() => approveSummaryMaterials(quote(), ["missing"], true)).toThrow(
    "selection changed",
  );
});
it("conversion preserves manual lines and pricing, adds no invented costs, and cannot run twice", () => {
  const q = quote();
  const manual = structuredClone(q.lines);
  const next = sendShoppingList(approveSummaryMaterials(q, ["a"], true));
  expect(next.lines.slice(0, manual.length)).toEqual(manual);
  expect(next.lines.at(-1)).toMatchObject({
    cost: 0,
    quantity: 20,
    takeoffId: "a",
  });
  expect(calculate(next).cost).toBe(calculate(q).cost);
  expect(() => sendShoppingList(next)).toThrow("No approved");
});
it("inline material changes reset previous approval and calculator verification", () => {
  const t = item({ status: "Approved", reviewAcknowledged: true });
  const next = applyQuickMaterialChanges(
    t,
    quickMaterialChanges(t, { ...quickMaterialDraft(t), quantity: 25 }),
  );
  expect(next.status).toBe("Proposed");
  expect(next.reviewAcknowledged).toBe(false);
});
it("does not bulk approve labour or informational drawing observations", () => {
  for (const delta of [
    { destination: "Labour" as const },
    { destination: "Informational" as const },
  ]) {
    const q = quote([item(delta)]);
    expect(() => approveSummaryMaterials(q, ["a"], true)).toThrow(
      "non-material",
    );
  }
});
