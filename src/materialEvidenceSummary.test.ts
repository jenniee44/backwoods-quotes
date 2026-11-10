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
});
