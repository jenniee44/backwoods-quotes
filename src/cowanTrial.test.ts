import { describe, expect, it } from "vitest";
import { newQuote, detailDefaults, companyDefaults } from "./model";
import { applyCowanTrialPiles, cowanBeamLinearFeet, cowanTrial, hasCowanTrialPiles, isCowanOriginalPlanTrial } from "./cowanTrial";
import { generatePreliminaryBudget } from "./preliminaryBudget";

const pricing = { labourRate: 75, materialMarkup: 15, overhead: 5, contingency: 3, hst: 13, internalLabourCost: 35, otherMarkup: 10, targetMargin: 25 };
function trial() {
  const q = newQuote(pricing, [], detailDefaults, companyDefaults);
  q.name = "Cowan Park Deck Replacement";
  q.documents = [{ id: "plan", name: "Plans.pdf", type: "application/pdf", data: "", addedAt: "" }];
  return generatePreliminaryBudget(q);
}

describe("Cowan Park original-plan trial (separate from genuine job changes)", () => {
  it("records explicit test inputs and the beam ply length without deciding board stock lengths", () => {
    expect(cowanTrial.pileCount).toBe(12);
    expect(cowanBeamLinearFeet).toBe(218.25);
  });
  it("does not change any other estimate line or total pile allowance", () => {
    const q = trial();
    const original = q.lines.find(l => l.description.includes("Helical pile"))!;
    const after = applyCowanTrialPiles(q);
    const pile = after.lines.find(l => l.id === original.id)!;
    expect(pile.quantity).toBe(12);
    expect(pile.cost * pile.quantity).toBeCloseTo(original.cost * original.quantity);
    expect(pile.materialNotes).toContain("NOT a supplier quote");
    expect(after.lines.filter(l => l.id !== original.id)).toEqual(q.lines.filter(l => l.id !== original.id));
    expect(hasCowanTrialPiles(after)).toBe(true);
    expect(applyCowanTrialPiles(after)).toBe(after);
  });
  it("does not apply this trial to any unrelated quote or locked quote", () => {
    const q = trial();
    expect(isCowanOriginalPlanTrial(q)).toBe(true);
    q.name = "Unrelated job";
    expect(() => applyCowanTrialPiles(q)).toThrow(/only for/);
    q.name = "Cowan Park";
    q.status = "Sent";
    expect(() => applyCowanTrialPiles(q)).toThrow(/editable draft/);
  });
});
