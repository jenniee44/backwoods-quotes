import { it, expect } from "vitest";
import { seed, type TakeoffItem, migrate } from "./model";
import { applyScopeOverride, scopeReviewItems } from "./scopeOverride";
import { includedScope } from "./takeoffScope";
import { takeoffAnalysisExport } from "./takeoffAnalysisExport";
import { customerDocument } from "./customerDocument";
const fixture = () => {
  const q = seed().quotes[0];
  q.status = "Draft";
  const base: TakeoffItem = {
    id: "rail",
    description: "Pressure-treated wood railings by others",
    specification: "PT wood railing",
    documentId: "synthetic",
    page: 1,
    quantity: null,
    unit: "linear ft",
    notes: "Drawing: railings by others",
    sourceFacts: ["Railings by others"],
    destination: "Informational",
    itemRole: "Construction item",
    status: "Proposed",
    origin: "ai",
    confidence: "Medium",
    workScope: "By others / excluded",
    included: false,
    subcontractorBasis: "Explicit by others",
  };
  q.takeoff = [
    base,
    {
      ...base,
      id: "stairs",
      description: "Stairs by others",
      notes: "Drawing: stairs by others",
    },
    {
      ...base,
      id: "piles",
      description: "Helical piles",
      notes: "Drawing foundation method subject to confirmation",
    },
    {
      ...base,
      id: "steel",
      description: "Existing steel beam to remain",
      notes: "Existing steel beam to remain",
    },
    {
      ...base,
      id: "posts",
      description: "Existing supporting posts to remain",
      notes: "Existing posts to remain",
    },
  ];
  return q;
};
it("uses contractor inclusion over by-others notes without changing drawing facts or auto-approving/pricing", () => {
  const q = fixture(),
    lines = structuredClone(q.lines),
    doc = customerDocument(q);
  const next = applyScopeOverride(
    applyScopeOverride(q, "rail", "Included"),
    "stairs",
    "Included",
  );
  for (const t of next.takeoff.slice(0, 2)) {
    expect(includedScope(t)).toBe(true);
    expect(t.status).toBe("Proposed");
    expect(t.reviewAcknowledged).toBe(false);
    expect(t.notes).toContain("by others");
    expect(t.subcontractorBasis).toBe("Explicit by others");
    expect(t.quantity).toBeNull();
    expect(t.originalScope?.destination).toBe("Informational");
  }
  expect(next.lines).toEqual(lines);
  expect(customerDocument(next)).toEqual(doc);
  expect(takeoffAnalysisExport(next).materials[0].scopeOverride).toBe(
    "Included",
  );
  const store = seed();
  store.quotes = [next];
  expect(migrate(store).quotes[0].takeoff).toEqual(next.takeoff);
});
it("subcontracts piles and preserves existing steel/posts without inventing any count", () => {
  let q = fixture();
  q = applyScopeOverride(q, "piles", "Subcontracted");
  q = applyScopeOverride(q, "steel", "Existing to Remain");
  q = applyScopeOverride(q, "posts", "Existing to Remain");
  expect(q.takeoff.find((t) => t.id === "piles")).toMatchObject({
    destination: "Subcontractor",
    quantity: null,
    status: "Proposed",
  });
  for (const t of q.takeoff.slice(3))
    expect(t).toMatchObject({
      included: false,
      workScope: "Existing work to remain",
    });
  q = applyScopeOverride(q, "rail", "Excluded");
  expect(q.takeoff[0].status).toBe("Rejected");
  expect(() =>
    applyScopeOverride({ ...q, status: "Sent" }, "rail", "Included"),
  ).toThrow();
  q.takeoff[1].convertedLineId = "manual-line";
  expect(() => applyScopeOverride(q, "stairs", "Included")).toThrow();
});
it("lets a contractor explicitly recover by-others scope stored only in original observations", () => {
  const q = fixture(),
    source = q.takeoff.shift()!;
  q.analysisReports = [
    {
      id: "report",
      fingerprint: "synthetic",
      createdAt: "2026-01-01",
      assumptions: [],
      warnings: [],
      sourceObservations: [source],
    },
  ];
  const item = scopeReviewItems(q).find((t) =>
    t.id.includes(":scope-source:"),
  )!;
  expect(item).toBeDefined();
  const next = applyScopeOverride(q, item.id, "Included");
  expect(next.analysisReports).toEqual(q.analysisReports);
  expect(next.takeoff.find((t) => t.id === item.id)).toMatchObject({
    included: true,
    status: "Proposed",
    destination: "Materials",
  });
  expect(
    scopeReviewItems(next).filter((t) => t.description === source.description),
  ).toHaveLength(1);
});
it("preserves existing labour and other-cost destinations when the contractor includes that work", () => {
  for (const destination of ["Labour", "Other Costs"] as const) {
    const q = fixture();
    q.takeoff[0].destination = destination;
    expect(
      applyScopeOverride(q, "rail", "Included").takeoff[0].destination,
    ).toBe(destination);
  }
});
