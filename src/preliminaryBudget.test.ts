import { describe, expect, it } from "vitest";
import { generatePreliminaryBudget, preliminaryBudgetAlreadyExists } from "./preliminaryBudget";
import { newQuote, detailDefaults, companyDefaults } from "./model";

function draft() {
  const q = newQuote(
    { labourRate: 75, materialMarkup: 15, overhead: 5, contingency: 3, hst: 13, internalLabourCost: 35, otherMarkup: 10, targetMargin: 25 },
    [],
    detailDefaults,
    companyDefaults,
  );
  q.analysisReports = [{
    id: "existing-analysis",
    fingerprint: "existing-pdf",
    createdAt: "2026-11-07",
    summary: {
      projectType: "Deck",
      workDescription: "Deck",
      majorScope: [],
      specifications: [],
      uncertainties: [],
      verification: [],
    },
  }] as unknown as typeof q.analysisReports;
  return q;
}
describe("preliminary saved-analysis budget", () => {
  it("reuses stored evidence without changing the takeoff, adds scoped rows and assumptions", () => {
    const q = draft();
    const after = generatePreliminaryBudget(q);
    expect(after.takeoff).toEqual(q.takeoff);
    expect(after.analysisReports).toEqual(q.analysisReports);
    expect(after.lines.some(l => l.description.includes("Helical pile"))).toBe(true);
    expect(after.lines.some(l => l.description.includes("Remove existing"))).toBe(true);
    expect(after.lines.some(l => l.description.includes("deck boards"))).toBe(true);
    expect(after.lines.every(l => l.description.startsWith("[Preliminary budget]"))).toBe(true);
    expect(after.details.assumptions).toContain("PRELIMINARY BUDGET ONLY");
    expect(q.lines).toHaveLength(0);
    expect(preliminaryBudgetAlreadyExists(after)).toBe(true);
    expect(() => generatePreliminaryBudget(after)).toThrow(/already exists/);
  });
  it("does not generate without saved analysis or on locked quotes", () => {
    const q = draft();
    q.analysisReports = [];
    expect(() => generatePreliminaryBudget(q)).toThrow(/No saved plan document or analysis/);
    q.status = "Sent";
    expect(() => generatePreliminaryBudget(q)).toThrow(/editable draft/);
  });
});