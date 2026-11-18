import { describe, expect, it } from "vitest";
import { calculateEvidenceEstimate } from "./evidenceEstimate";
describe("evidence-based estimate", () => {
  const input = { id: "joists", description: "PT joists", quantity: 20, unit: "each",
    source: "drawing" as const, evidence: "Sheet S1, joist schedule",
    materialUnitCost: 25, labourHoursPerUnit: 0.5, labourCostPerHour: 35,
    labourSellRatePerHour: 75, materialMarkupPercent: 15, wastePercent: 10 };
  it("calculates material, labour and customer amounts independently", () => {
    expect(calculateEvidenceEstimate(input)).toMatchObject({
      purchaseQuantity: 22, materialCost: 550, labourHours: 10,
      labourCost: 350, customerSubtotal: 1382.5, readyForQuote: true,
    });
  });
  it("crew size changes duration but not total labour hours or cost", () => {
    const solo = calculateEvidenceEstimate(input);
    const pair = calculateEvidenceEstimate({ ...input, crewSize: 2 });
    expect(solo.estimatedWorkDays).toBe(1.25);
    expect(pair.estimatedWorkDays).toBe(0.63);
    expect(pair.labourHours).toBe(solo.labourHours);
    expect(pair.labourCost).toBe(solo.labourCost);
  });
  it("does not manufacture missing quantities", () => {
    const result = calculateEvidenceEstimate({ ...input, quantity: null });
    expect(result.purchaseQuantity).toBeNull();
    expect(result.customerSubtotal).toBeNull();
    expect(result.readyForQuote).toBe(false);
  });
  it("flags unverified assumptions", () => {
    const result = calculateEvidenceEstimate({ ...input, source: "assumption" });
    expect(result.readyForQuote).toBe(false);
    expect(result.reviewReasons).toContain("Quantity is an assumption");
  });
  it("requires a drawing reference for drawing-derived inputs", () => {
    expect(calculateEvidenceEstimate({ ...input, evidence: "" }).readyForQuote).toBe(false);
  });
});
