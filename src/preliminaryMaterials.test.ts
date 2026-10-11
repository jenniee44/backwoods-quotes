import { expect, it } from "vitest";
import {
  friendlyMaterialName,
  quantityLabel,
  unresolvedMaterials,
} from "./preliminaryMaterials";
import { consolidateTakeoff } from "./consolidateTakeoff";
import { defaults, newQuote } from "./model";
import type { TakeoffItem } from "./model";
const item = (delta: Partial<TakeoffItem> = {}): TakeoffItem => ({
  id: "a",
  description:
    "Supply and install deck joists as described in construction note",
  specification: "2x6 PT at 16 in O/C",
  quantity: 12,
  unit: "boards",
  documentId: "synthetic",
  page: 1,
  notes: "New work",
  status: "Proposed",
  origin: "ai",
  confidence: "High",
  category: "Joists",
  destination: "Materials",
  location: "Rear deck",
  workScope: "New work",
  included: true,
  ...delta,
});
it("friendly display names preserve original descriptions/specifications/evidence", () => {
  const t = item({ sourceFacts: ["Original synthetic source"] }),
    before = structuredClone(t);
  expect(friendlyMaterialName(t)).toBe("Deck joists");
  expect(t).toEqual(before);
  expect(
    friendlyMaterialName(item({ description: "Beam B-2 with framing notes" })),
  ).toBe("Beams — B-2");
  expect(
    friendlyMaterialName(
      item({ description: "Floor joists", location: "Garage" }),
    ),
  ).toBe("Joists");
  expect(
    friendlyMaterialName(
      item({ description: "Custom engineered component A" }),
    ),
  ).toBe("Custom engineered component A");
});
it("names do not invent material type, size or price", () => {
  const t = item({
    description: "Ledger flashing per architectural detail",
    specification: "",
  });
  expect(friendlyMaterialName(t)).toBe("Ledger flashing");
  expect(t.specification).toBe("");
  expect(
    friendlyMaterialName(
      item({ description: "Helical pile foundation per engineer" }),
    ),
  ).toBe("Helical piles");
});
it("quantity labels distinguish unknown, proposed and contractor-verified quantities", () => {
  const t = item(),
    q = { ...newQuote(defaults, []), takeoff: [t] };
  expect(quantityLabel(q, t)).toBe("Needs verification");
  expect(quantityLabel(q, { ...t, quantity: null })).toBe("Quantity needed");
  expect(
    quantityLabel(q, { ...t, status: "Approved", reviewAcknowledged: true }),
  ).toBe("Verified quantity");
  expect(
    quantityLabel(q, {
      ...t,
      status: "Approved",
      calculation: {
        kind: "area",
        inputs: { length: 10, width: 10, waste: 0 },
        verified: false,
      },
    }),
  ).toBe("Needs verification");
});
it("unresolved filtering keeps missing/conflicting scope work but does not require review of excluded records", () => {
  const a = item({ quantity: null }),
    b = item({ id: "b", quantity: 10, location: "Different deck" }),
    c = item({ id: "c", included: false, status: "Rejected" }),
    d = item({
      id: "d",
      workScope: "Requires scope confirmation",
      included: false,
      location: "Unknown area",
    });
  const q = { ...newQuote(defaults, []), takeoff: [a, b, c, d] };
  expect(unresolvedMaterials(q, q.takeoff).map((t) => t.id)).toEqual([
    "a",
    "b",
    "d",
  ]);
});
it("exact observations with legacy category differences consolidate without summing and retain original descriptions", () => {
  const a = item({ category: "Miscellaneous" }),
    b = item({ id: "b", description: "PT deck joists", page: 2 });
  const next = consolidateTakeoff([a, b], true);
  expect(next).toHaveLength(1);
  expect(next[0].quantity).toBe(12);
  expect(next[0].sourceFacts).toContain(
    "Original observation: " + a.description,
  );
  expect(next[0].sourceFacts).toContain(
    "Original observation: " + b.description,
  );
});
it("never merges low-confidence, uncertain, different assembly or conflicting observations", () => {
  const a = item();
  for (const delta of [
    { confidence: "Low" as const },
    { confidence: "Unspecified" as const },
    { notes: "Possibly another assembly" },
    { quantity: 15 },
    { location: "Front deck" },
    { description: "Deck joist assembly 2" },
    { alternativeOption: "Different layout" },
  ]) {
    expect(
      consolidateTakeoff([a, item({ id: "b", ...delta })], true),
    ).toHaveLength(2);
  }
});
it("foundation methods remain separate even when alternative metadata was not provided", () => {
  const a = item({
    description: "Concrete footing",
    specification: "Engineer specified support",
    category: "Footings / concrete",
    unit: "each",
    quantity: 4,
  });
  const b = { ...a, id: "b", description: "Helical pile footing" };
  expect(consolidateTakeoff([a, b], true)).toHaveLength(2);
});
