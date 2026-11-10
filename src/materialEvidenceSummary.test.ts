import { describe, expect, it } from "vitest";
import { newQuote, detailDefaults, companyDefaults, type TakeoffItem } from "./model";
import { buildMaterialEvidence } from "./materialEvidenceSummary";
const pricing = { labourRate: 75, materialMarkup: 15, overhead: 5, contingency: 3, hst: 13 };
function quote() { return newQuote(pricing, [], detailDefaults, companyDefaults); }
function item(id: string, overrides: Partial<TakeoffItem> = {}): TakeoffItem {
  return {
    id, description: "PT lumber", quantity: 6, unit: "each",
    documentId: "drawing", page: 1, notes: "",
    status: "Proposed", confidence: "Medium",
    destination: "Materials", category: "Framing",
    ...overrides,
  } as TakeoffItem;
}
describe("read-only material evidence", () => {
  it("does not change the quote, add costs or count rejected evidence", () => {
    const q = quote();
    q.takeoff = [item("one"), item("rejected", {status:"Rejected"})];
    const snapshot = JSON.stringify(q);
    const rows = buildMaterialEvidence(q);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(6);
    expect(rows[0].needsReview).toContain("Purchase count unverified");
    expect(JSON.stringify(q)).toBe(snapshot);
  });
  it("does not add together repeated analysis observations", () => {
    const q = quote();
    q.takeoff = [item("one", {analysisSourceKey:"shared"}),item("two", {analysisSourceKey:"shared"})];
    expect(buildMaterialEvidence(q)).toHaveLength(1);
  });
  it("distinguishes absent purchase quantities", () => {
    const q = quote();
    q.takeoff = [item("unknown", {quantity:null})];
    expect(buildMaterialEvidence(q)[0].quantity).toBeNull();
  });
  it("recovers only saved raw material observations without modifying the quote", () => {
    const q = quote();
    q.analysisReports = [{
      id: "existing-report", fingerprint: "old", createdAt: "2026-10-01",
      assumptions: [], warnings: [],
      sourceDocuments: [{id:"drawing",name:"Plans.pdf"}],
      sourceObservations: [
        { description: "2x6 PT joists", quantity: 12, unit: "each", documentId: "drawing",
          page: 1, notes: "", confidence: "Low", destination: "Materials" },
        { description: "2x6 PT joists", quantity: 12, unit: "each", documentId: "drawing",
          page: 1, notes: "", confidence: "Low", destination: "Materials" },
        { description: "Deck demolition", quantity: 2, unit: "hours", documentId: "drawing",
          page: 1, notes: "", confidence: "Low", destination: "Labour" },
      ],
    }];
    const snapshot = JSON.stringify(q);
    const rows = buildMaterialEvidence(q);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(12);
    expect(rows[0].needsReview).toContain("Recovered from saved report, not indexed takeoff");
    expect(rows[0].source).toContain("Plans.pdf");
    expect(JSON.stringify(q)).toBe(snapshot);
  });
  it("does not combine report observations with indexed material quantities", () => {
    const q = quote();
    q.takeoff = [item("indexed")];
    q.analysisReports = [{
      id: "old", fingerprint: "old", createdAt: "2026-10-01", assumptions: [], warnings: [],
      sourceObservations: [{description:"PT beams",quantity:9,unit:"each",
        documentId:"drawing",page:1,notes:"",confidence:"Medium",destination:"Materials"}],
    }];
    const rows = buildMaterialEvidence(q);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("indexed");
  });
});
