import { describe, expect, it } from "vitest";
import { approveEvidenceEstimate } from "./approveEvidenceEstimate";
import type { Quote } from "./model";
import type { EstimateInput } from "./evidenceEstimate";

const input: EstimateInput = {
  id: "deck-1", description: "Deck joists", quantity: 10, unit: "each",
  source: "drawing", evidence: "Drawing S1 page 2", materialUnitCost: 30,
  labourHoursPerUnit: 0.5, labourCostPerHour: 35,
  labourSellRatePerHour: 75, materialMarkupPercent: 15, wastePercent: 10,
};
const quote = (overrides: Partial<Quote> = {}): Quote => ({
  status: "Draft", lines: [], takeoff: [], documents: [], analysisReports: [],
  pricing: { materialMarkup: 15, labourRate: 75, internalLabourCost: 35,
    overhead: 5, contingency: 3, hst: 13 },
  ...overrides,
} as Quote);
describe("reviewed estimate conversion safety", () => {
  it("rejects a missing takeoff item without changing the quote", () => {
    const q = quote();
    expect(() => approveEvidenceEstimate(q, input)).toThrow("no longer exists");
    expect(q.lines).toHaveLength(0);
  });
  it("rejects sent quotes", () => {
    expect(() => approveEvidenceEstimate(quote({ status: "Sent" }), input))
      .toThrow("editable draft");
  });
  it("prevents duplicate conversions", () => {
    const q = quote({ takeoff: [{ id: "deck-1", convertedLineId: "already" }] as Quote["takeoff"] });
    expect(() => approveEvidenceEstimate(q, input)).toThrow("already been converted");
  });
  it("prevents approval when takeoff review is incomplete", () => {
    const q = quote({ takeoff: [{ id: "deck-1", description: "Deck joists",
      quantity: 10, unit: "each", status: "Proposed" }] as Quote["takeoff"] });
    expect(() => approveEvidenceEstimate(q, input)).toThrow("Resolve the drawing takeoff");
  });
});
