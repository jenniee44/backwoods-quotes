import { expect, it } from "vitest";
import {
  quickMaterialDraft,
  quickMaterialChanges,
  applyQuickMaterialChanges,
  needsStockLength,
} from "./quickMaterialEdit";
import {
  materialReviewGroup,
  materialNextAction,
} from "./materialReviewPresentation";
import {
  newQuote,
  defaults,
  calculate,
  takeoffToLine,
  seed,
  migrate,
} from "./model";
import type { TakeoffItem } from "./model";
import { approveTakeoff, reviewTakeoff, canConvert } from "./planAnalysis";
import { consolidateTakeoff } from "./consolidateTakeoff";
import { consolidateCompared } from "./takeoffOverlap";
import { customerDocument } from "./customerDocument";
const item = (delta: Partial<TakeoffItem> = {}): TakeoffItem => ({
  id: "a",
  description: "Deck joists",
  specification: "2x6 PT @ 16 in O/C",
  quantity: 12,
  unit: "boards",
  category: "Miscellaneous",
  destination: "Materials",
  documentId: "plan",
  page: 1,
  notes: "New work",
  confidence: "High",
  origin: "ai",
  workScope: "New work",
  included: true,
  status: "Proposed",
  location: "Rear deck",
  ...delta,
});
function quote(t = item()) {
  const q = newQuote(defaults, []);
  q.name = "Synthetic deck";
  q.takeoff = [t];
  return q;
}
it("quick editing defaults to extracted data, makes no mutation, and unchanged saves preserve calculations and approval", () => {
  const t = item({ status: "Approved", reviewAcknowledged: true });
  const before = structuredClone(t);
  const d = quickMaterialDraft(t);
  expect(d.specification).toBe(t.specification);
  expect(d.stockLength).toBeNull();
  expect(quickMaterialChanges(t, d)).toEqual({});
  expect(t).toEqual(before);
});
it("one saved quantity/specification edit resets approval without changing pricing or manual lines", () => {
  const q = quote(item({ status: "Approved", reviewAcknowledged: true }));
  const before = calculate(q),
    lines = structuredClone(q.lines);
  const d = quickMaterialDraft(q.takeoff[0]);
  d.quantity = 18;
  d.specification = "Contractor verified 2x6 PT";
  q.takeoff[0] = applyQuickMaterialChanges(
    q.takeoff[0],
    quickMaterialChanges(q.takeoff[0], d),
  );
  expect(q.takeoff[0]).toMatchObject({
    quantity: 18,
    status: "Proposed",
    reviewAcknowledged: false,
  });
  expect(calculate(q)).toEqual(before);
  expect(q.lines).toEqual(lines);
});
it("No excludes material; by-others requires explicit Yes and scope verification", () => {
  const t = item({ workScope: "By others / excluded", included: false });
  const d = quickMaterialDraft(t);
  d.included = true;
  expect(() => quickMaterialChanges(t, d)).toThrow("Verify");
  d.scopeVerified = true;
  const changed = applyQuickMaterialChanges(t, quickMaterialChanges(t, d));
  expect(reviewTakeoff(changed).status).toBe("Reviewed");
  const no = { ...quickMaterialDraft(changed), included: false };
  expect(
    canConvert(
      applyQuickMaterialChanges(changed, quickMaterialChanges(changed, no)),
    ),
  ).toBe(false);
});
it.each(["Existing work to remain", "Requires scope confirmation"] as const)(
  "scope %s cannot be included by quick edit",
  (scope) => {
    const t = item({ workScope: scope, included: false }),
      d = quickMaterialDraft(t);
    d.included = true;
    d.scopeVerified = true;
    expect(() => quickMaterialChanges(t, d)).toThrow("scope");
  },
);
it("stock edits invalidate calculator quantities and preserve previous calculation evidence", () => {
  const t = item({
    calculation: {
      kind: "joists",
      inputs: { length: 16, spacing: 16, member: 12, stock: 12, waste: 0 },
      verified: true,
    },
    quantity: 13,
    calculationBasis: "16 ft at 16 in spacing",
  });
  const d = quickMaterialDraft(t);
  expect(d.stockLength).toBe(12);
  d.stockLength = 16;
  const changed = applyQuickMaterialChanges(t, quickMaterialChanges(t, d));
  expect(changed.calculation?.verified).toBe(false);
  expect(changed.quantity).toBeNull();
  expect(changed.notes).toContain("Previous calculation");
  expect(() => reviewTakeoff(changed)).toThrow();
});
it("manual quantity edits preserve original recipe evidence instead of claiming calculated verification", () => {
  const t = item({
    calculation: {
      kind: "posts",
      inputs: { count: 4, waste: 0 },
      verified: true,
    },
    calculationBasis: "Four verified support locations",
  });
  const d = quickMaterialDraft(t);
  d.quantity = 5;
  const changed = applyQuickMaterialChanges(t, quickMaterialChanges(t, d));
  expect(changed.calculation).toBeUndefined();
  expect(changed.classification).toBe("Estimating suggestion");
  expect(changed.notes).toContain("Four verified support locations");
});
it.each([-1, NaN, Infinity])("rejects invalid quantity %s", (quantity) => {
  const t = item(),
    d = quickMaterialDraft(t);
  d.quantity = quantity;
  expect(() => quickMaterialChanges(t, d)).toThrow("quantity");
});
it("known stock lengths persist privately through conversion and do not affect pricing", () => {
  const t = item();
  const d = quickMaterialDraft(t);
  d.stockLength = 12;
  const changed = applyQuickMaterialChanges(t, quickMaterialChanges(t, d));
  const approved = approveTakeoff(reviewTakeoff(changed));
  const q = quote(approved);
  const next = takeoffToLine(q, approved, "Materials");
  expect(next.lines[0].cost).toBe(0);
  expect(next.lines[0].takeoffSource!.stockLength).toBe(12);
  const store = seed();
  store.quotes = [next];
  expect(migrate(store).quotes[0].takeoff[0].stockLength).toBe(12);
  expect(JSON.stringify(customerDocument(next))).not.toMatch(
    /stockLength|sourceFacts|confidence|Previous calculation/,
  );
});
it("different stock lengths cannot be combined or automatically consolidated", () => {
  const a = item({ stockLength: 12 }),
    b = item({ id: "b", stockLength: 16 });
  expect(consolidateTakeoff([a, b], true)).toHaveLength(2);
  const q = quote(a);
  q.takeoff.push(b);
  expect(() => consolidateCompared(q, a, b)).toThrow("distinct");
});
it.each([
  ["Deck joists", "Deck Framing"],
  ["Deck beams", "Deck Framing"],
  ["Deck posts", "Deck Framing"],
  ["Simpson joist hangers", "Deck Framing"],
  ["Deck boards", "Decking"],
  ["Concrete footings", "Footings & Foundations"],
  ["Aluminum ledger flashing", "Flashing & Waterproofing"],
])(
  "presents %s under %s without rewriting legacy category",
  (description, group) => {
    const t = item({ description });
    expect(materialReviewGroup(quote(t), t)).toBe(group);
    expect(t.category).toBe("Miscellaneous");
  },
);
it("only the most relevant next action is presented", () => {
  const t = item({ quantity: null });
  expect(materialNextAction(quote(t), t)).toBe("Enter verified joist quantity");
  const a = item({ description: "Concrete footings" }),
    b = item({ id: "b", description: "Helical piles" });
  const q = quote(a);
  q.takeoff.push(b);
  expect(materialNextAction(q, a)).toBe("Select foundation method");
});
it("stock fields are limited to applicable lumber and calculations", () => {
  expect(needsStockLength(item())).toBe(true);
  expect(
    needsStockLength(item({ description: "Concrete footing" })),
  ).toBeFalsy();
  expect(
    needsStockLength(
      item({ description: "Joist install", destination: "Labour" }),
    ),
  ).toBeFalsy();
});

it("calculator stock values take precedence over stale metadata and unknown inputs stay unknown", () => {
  const t = item({
    stockLength: 12,
    calculation: { kind: "joists", inputs: { stock: 16 }, verified: false },
  });
  expect(quickMaterialDraft(t).stockLength).toBe(16);
  expect(quickMaterialChanges(t, quickMaterialDraft(t))).toEqual({});
  t.calculation!.inputs.stock = null;
  expect(quickMaterialDraft(t).stockLength).toBeNull();
});

it("historical calculator values do not become transcribed drawing measurements", () => {
  const t = item({
    sourceFacts: ["Drawing: joist length 12 ft"],
    calculationBasis: "Earlier estimate layout 20 ft",
    calculation: { kind: "joists", inputs: { stock: 12 }, verified: false },
  });
  const d = quickMaterialDraft(t);
  d.stockLength = 16;
  const changed = applyQuickMaterialChanges(t, quickMaterialChanges(t, d));
  expect(changed.sourceFacts).toEqual(t.sourceFacts);
  expect(changed.notes).toContain("20 ft");
});
