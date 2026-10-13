import { expect, it } from "vitest";
import { purchasingGroups, quantityReason } from "./purchasingGroups";
import { newQuote, defaults } from "./model";
import type { TakeoffItem } from "./model";
const item = (
  id: string,
  description: string,
  specification: string,
): TakeoffItem => ({
  id,
  documentId: "synthetic",
  page: 1,
  description,
  specification,
  quantity: 3,
  unit: "runs",
  location: "Deck A",
  destination: "Materials",
  origin: "ai",
  confidence: "High",
  status: "Proposed",
  workScope: "New work",
  included: true,
  notes: "New work",
  sourceFacts: ["Synthetic source " + id],
});
it("groups repeated-looking beams, joists and hangers without merging assemblies or adding counts", () => {
  const a = item("b1", "Beam B-1", "3-ply 2x10 PT"),
    b = { ...a, id: "b2", description: "Beam B-2", page: 2 };
  const j = item("j1", "Deck joists", "2x6 PT"),
    h = item("h1", "Simpson LUS26 joist hangers", "Simpson LUS26");
  const items = [
    a,
    b,
    j,
    { ...j, id: "j2", location: "Side deck" },
    h,
    { ...h, id: "h2", description: "LUS26 joist hangers at ledger" },
  ];
  const q = { ...newQuote(defaults, []), takeoff: items };
  const before = structuredClone(q);
  const groups = purchasingGroups(q, items);
  expect(groups).toHaveLength(3);
  expect(groups.every((g) => g.quantity === null)).toBe(true);
  expect(groups[0].items.map((i) => i.id)).toEqual(["b1", "b2"]);
  expect(groups[0].reason).toContain("Counts are not added");
  expect(q).toEqual(before);
});
it("only shows a safely calculated single purchase quantity; conflicting observations remain unresolved", () => {
  const a = {
    ...item("j", "Deck joists", "2x6 PT"),
    quantity: 13,
    unit: "boards",
    quantityMethod: "Calculated" as const,
    calculationBasis: "Verified layout spacing and end positions: 13 joists",
  };
  const q = { ...newQuote(defaults, []), takeoff: [a] };
  expect(purchasingGroups(q, [a])[0].quantity).toBe(13);
  expect(
    purchasingGroups(q, [{ ...a, warnings: ["Conflicting quantities"] }])[0]
      .quantity,
  ).toBeNull();
  expect(
    purchasingGroups(q, [{ ...a, quantityMethod: "Counted" }])[0].quantity,
  ).toBeNull();
});
it("keeps different specifications and foundation methods distinct, excludes reference work", () => {
  const a = item("b", "Beam", "3-ply 2x10 PT");
  const items = [
    a,
    { ...a, id: "other", specification: "2-ply 2x8 PT" },
    { ...a, id: "old", workScope: "Existing work to remain" as const },
    { ...a, id: "notes", description: "General construction notes" },
  ];
  expect(
    purchasingGroups({ ...newQuote(defaults, []), takeoff: items }, items),
  ).toHaveLength(2);
});
it("missing-input explanations identify beam lengths, joist layout and connection counts", () => {
  const q = newQuote(defaults, []);
  expect(quantityReason(q, item("b", "Beam", "PT"))).toContain("beam lengths");
  expect(quantityReason(q, item("j", "Deck joists", "PT"))).toContain(
    "deck layout dimensions",
  );
  expect(quantityReason(q, item("h", "Joist hangers", "LUS26"))).toContain(
    "connection counts",
  );
});
it("a calculated foundation quantity stays unconfirmed while competing foundation methods remain unresolved", () => {
  const a = {
    ...item("f", "Concrete footings", "Concrete pier"),
    quantity: 4,
    unit: "each",
    quantityMethod: "Calculated" as const,
    calculationBasis: "Four source foundation locations",
  };
  const b = {
    ...a,
    id: "p",
    description: "Helical piles",
    specification: "Helical pile",
  };
  const q = { ...newQuote(defaults, []), takeoff: [a, b] };
  expect(purchasingGroups(q, q.takeoff).every((g) => g.quantity === null)).toBe(
    true,
  );
  expect(quantityReason(q, a)).toContain("foundation method");
});
