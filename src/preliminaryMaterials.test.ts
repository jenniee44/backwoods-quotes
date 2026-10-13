import { prepareMaterialsSummary } from "./materialsSummary";
import { takeoffToLine } from "./model";
import { expect, it } from "vitest";
import {
  friendlyMaterialName,
  preliminaryDisposition,
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
it("identical unknown-quantity observations merge across generic review headings, keeping unknowns unknown", () => {
  const a = item({
    quantity: null,
    confidence: "Low",
    scopeGroup: "Deck Framing",
  });
  const b = item({
    id: "b",
    quantity: null,
    confidence: "Low",
    scopeGroup: "Joists",
    page: 2,
  });
  const r = consolidateTakeoff([a, b], true);
  expect(r).toHaveLength(1);
  expect(r[0].quantity).toBeNull();
  expect(r[0].sourceFacts?.join()).toContain("page 2");
});
it("beam runs consolidate but never become board purchases", () => {
  const a = item({
    description: "Built-up beams",
    specification: "3-ply 2x10 PT",
    quantity: 3,
    unit: "runs",
    scopeGroup: "Beams",
  });
  const b = {
    ...a,
    id: "b",
    page: 2,
    unit: "beam runs",
    scopeGroup: "Deck Framing",
  };
  const r = consolidateTakeoff([a, b], true);
  expect(r).toHaveLength(1);
  expect(r[0].quantity).toBe(3);
  expect(r[0].unit).toBe("runs");
});
it("identical LUS26 observations consolidate across pages; distinct connection locations remain separate", () => {
  const a = item({
    description: "Simpson LUS26 joist hangers",
    specification: "Simpson LUS26",
    unit: "each",
    quantity: null,
    confidence: "Low",
    scopeGroup: "Hangers / connectors",
  });
  expect(
    consolidateTakeoff(
      [a, { ...a, id: "b", page: 3, scopeGroup: "Connectors" }],
      true,
    ),
  ).toHaveLength(1);
  expect(
    consolidateTakeoff(
      [a, { ...a, id: "b", page: 3, location: "Front deck" }],
      true,
    ),
  ).toHaveLength(2);
});
it("unreadable specifications and named alternative assemblies stay distinct even with identical counts", () => {
  const a = item({
    description: "Concrete footing",
    specification: "12 inch footing depth unreadable",
    unit: "each",
    quantity: 4,
  });
  expect(
    consolidateTakeoff([a, { ...a, id: "b", page: 2 }], true),
  ).toHaveLength(2);
});
it("assembly boundaries recorded in evidence prevent grouping deceptively identical descriptions", () => {
  const a = item({ sourceFacts: ["Deck A assembly: A1"] });
  expect(
    consolidateTakeoff(
      [a, { ...a, id: "b", page: 2, sourceFacts: ["Deck A assembly: A2"] }],
      true,
    ),
  ).toHaveLength(2);
});
it("built-in Posts & Beams / Hardware & Connectors headings are presentation aliases, not assembly identities", () => {
  for (const [description, specification, scopeGroup] of [
    ["Built-up beams", "3-ply 2x10 PT", "Posts & Beams"],
    ["Simpson LUS26 joist hangers", "Simpson LUS26", "Hardware & Connectors"],
  ]) {
    const a = item({ description, specification, scopeGroup });
    expect(
      consolidateTakeoff(
        [a, { ...a, id: "b", page: 2, scopeGroup: "Deck Framing" }],
        true,
      ),
    ).toHaveLength(1);
  }
});
it("general drawing notes retain evidence but cannot become billable material lines", () => {
  const t = item({
    description: "General construction notes",
    sourceFacts: ["Do not scale drawings"],
    quantity: 4,
  });
  const next = prepareMaterialsSummary([t]);
  expect(next[0]).toMatchObject({
    destination: "Informational",
    itemRole: "Document observation",
    sourceFacts: t.sourceFacts,
    quantity: 4,
  });
  const q = { ...newQuote(defaults, []), takeoff: next };
  expect(() =>
    takeoffToLine(q, { ...next[0], status: "Approved" }, "Materials"),
  ).toThrow("observations");
  expect(t.destination).toBe("Materials");
});
it("identical hanger products at the ledger and at the beam are different connections", () => {
  const a = item({
    description: "LUS26 joist hangers at ledger",
    specification: "Simpson LUS26",
    unit: "each",
    quantity: 13,
  });
  expect(
    consolidateTakeoff(
      [
        a,
        { ...a, id: "b", description: "LUS26 joist hangers at beam", page: 2 },
      ],
      true,
    ),
  ).toHaveLength(2);
});
it("explicitly included replacement material is not hidden as an existing structure", () => {
  expect(
    preliminaryDisposition(
      item({
        description: "Existing deck boards to replace",
        workScope: "Existing work to remove or modify",
        included: true,
        scopeVerified: true,
      }),
    ),
  ).toBe("material");
  expect(
    preliminaryDisposition(
      item({
        description: "Existing deck",
        workScope: "Existing work to remain",
      }),
    ),
  ).toBe("information");
});
it("the same main-deck label in location versus description does not prevent consolidation", () => {
  const a = item({
    description: "Main deck joists",
    location: "Main deck",
    specification: "2x6 PT",
    quantity: 12,
  });
  const b = { ...a, id: "repeat-main", page: 2, description: "Deck joists" };
  expect(consolidateTakeoff([a, b], true)).toHaveLength(1);
  expect(
    consolidateTakeoff(
      [a, { ...b, description: "Perimeter deck joists" }],
      true,
    ),
  ).toHaveLength(2);
});
it("confirmed excluded by-others work stays informational and legacy materials remain visible", () => {
  expect(
    preliminaryDisposition(
      item({ workScope: "By others", scopeVerified: true, included: false }),
    ),
  ).toBe("information");
  expect(preliminaryDisposition(item({ destination: undefined }))).toBe(
    "material",
  );
});
it("equivalent explicit spacing notation matches without hiding different spacings", () => {
  const a = item({ specification: '2x6 PT @ 16" O.C.' });
  expect(
    consolidateTakeoff(
      [
        a,
        {
          ...a,
          id: "spacing-repeat",
          page: 2,
          specification: "2x6 PT at 16 inches on center",
        },
      ],
      true,
    ),
  ).toHaveLength(1);
  expect(
    consolidateTakeoff(
      [
        a,
        {
          ...a,
          id: "spacing-different",
          page: 2,
          specification: "2x6 PT at 12 inches on center",
        },
      ],
      true,
    ),
  ).toHaveLength(2);
});
