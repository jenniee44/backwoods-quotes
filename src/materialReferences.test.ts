import { it, expect } from "vitest";
import {
  isGeneralSpecification,
  relevantSpecifications,
} from "./materialReferences";
import { prepareMaterialsSummary } from "./materialsSummary";
import { newQuote, defaults } from "./model";
import type { TakeoffItem } from "./model";
const reference: TakeoffItem = {
  id: "note",
  description: "All fasteners shall be galvanized",
  specification: "Hot-dip galvanized fasteners and connectors",
  quantity: null,
  unit: "each",
  documentId: "plan",
  page: 3,
  location: "Deck A",
  notes: "New work",
  status: "Proposed",
  origin: "ai",
  confidence: "High",
  destination: "Materials",
  workScope: "New work",
  included: true,
  sourceFacts: ["Synthetic corrosion protection requirement"],
};
it("general hardware requirements are attached as evidence without purchasing quantities or record loss", () => {
  const hardware = {
    ...reference,
    id: "hardware",
    description: "Simpson LUS26 joist hangers",
    specification: "Simpson LUS26",
    quantity: 13,
  };
  const timber = {
    ...hardware,
    id: "timber",
    description: "Deck joists",
    specification: "2x6 PT",
  };
  const q = {
    ...newQuote(defaults, []),
    takeoff: [reference, hardware, timber],
  };
  const original = structuredClone(q);
  expect(relevantSpecifications(q, [hardware])).toEqual([reference]);
  expect(relevantSpecifications(q, [timber])).toEqual([]);
  const next = prepareMaterialsSummary(q.takeoff);
  expect(next.find((t) => t.id === "note")).toMatchObject({
    destination: "Informational",
    sourceFacts: reference.sourceFacts,
    quantity: null,
  });
  expect(q).toEqual(original);
});
it("quantified/converted products, other documents and excluded requirements remain safe", () => {
  expect(isGeneralSpecification({ ...reference, quantity: 100 })).toBe(false);
  expect(
    isGeneralSpecification({ ...reference, convertedLineId: "saved" }),
  ).toBe(false);
  const h = {
    ...reference,
    id: "h",
    description: "Joist hangers",
    specification: "LUS26",
    quantity: 13,
  };
  for (const ref of [
    { ...reference, documentId: "other" },
    { ...reference, location: "Other deck" },
    { ...reference, included: false },
    { ...reference, workScope: "By others" as const, scopeVerified: false },
    { ...reference, status: "Rejected" as const },
  ]) {
    expect(
      relevantSpecifications({ ...newQuote(defaults, []), takeoff: [ref, h] }, [
        h,
      ]),
    ).toEqual([]);
  }
});
it("reference classification precedes consolidation so a requirement cannot swallow a purchase candidate", () => {
  const ref = { ...reference, specification: "Hot-dip galvanized fasteners" };
  const hardware = {
    ...ref,
    id: "product",
    description: "Galvanized fasteners",
    category: "Fasteners",
    quantity: null,
  };
  const next = prepareMaterialsSummary([ref, hardware]);
  expect(next).toHaveLength(2);
  expect(next.find((t) => t.id === "product")?.destination).toBe("Materials");
  expect(next.find((t) => t.id === "note")?.destination).toBe("Informational");
});
it("summary presentation mode retains every separate observation and its approval state", () => {
  const a = {
    ...reference,
    id: "a",
    description: "Galvanized screws",
    quantity: 12,
    specification: "SDWS screws",
    category: "Fasteners",
    status: "Proposed" as const,
  };
  const b = {
    ...a,
    id: "b",
    page: 2,
    sourceFacts: ["Second source observation"],
  };
  const before = structuredClone([a, b]);
  const next = prepareMaterialsSummary([a, b], true);
  expect(next.map((t) => t.id)).toEqual(["a", "b"]);
  expect(next.map((t) => t.quantity)).toEqual([12, 12]);
  expect([a, b]).toEqual(before);
});
