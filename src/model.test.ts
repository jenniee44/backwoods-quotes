import { describe, it, expect } from "vitest";
import {
  calculate,
  convert,
  defaults,
  duplicate,
  jobTotals,
  linePrice,
  newLine,
  newQuote,
  round,
  seed,
  validate,
} from "./model";
describe("quote pricing", () => {
  it("calculates 40 boards at $18 with 15% markup", () => {
    const l = {
      ...newLine("Materials", defaults),
      quantity: 40,
      cost: 18,
      markup: 15,
    };
    expect(linePrice(l)).toBe(828);
    expect(calculate({ lines: [l], pricing: defaults }).cost).toBe(720);
  });
  it("separates internal labour cost from customer hourly rate", () => {
    const l = {
      ...newLine("Labour", defaults),
      quantity: 10,
      cost: 30,
      rate: 75,
    };
    const t = calculate({ lines: [l], pricing: defaults });
    expect(t.cost).toBe(300);
    expect(t.subtotal).toBe(750);
    expect(t.profit).toBe(450);
    expect(t.margin).toBe(60);
  });
  it("supports manual selling override, including zero", () => {
    const l = {
      ...newLine("Materials", defaults),
      quantity: 40,
      cost: 18,
      markup: 15,
      override: 900,
    };
    expect(linePrice(l)).toBe(900);
    expect(linePrice({ ...l, override: 0 })).toBe(0);
  });
  it("adds overhead and contingency to base independently and taxes subtotal", () => {
    const l = { ...newLine("Other Costs", defaults), quantity: 1, cost: 100 };
    const t = calculate({
      lines: [l],
      pricing: { ...defaults, overhead: 10, contingency: 5 },
    });
    expect(t.subtotal).toBe(115);
    expect(t.tax).toBe(14.95);
    expect(t.total).toBe(129.95);
  });
  it("distinguishes markup from margin", () => {
    const t = calculate({
      lines: [{ ...newLine("Materials", defaults), cost: 100, markup: 20 }],
      pricing: defaults,
    });
    expect(t.profit).toBe(20);
    expect(t.margin).toBeCloseTo(16.666666);
  });
  it("handles empty quotes and rounds cents", () => {
    expect(calculate({ lines: [], pricing: defaults }).margin).toBe(0);
    expect(round(1.005)).toBe(1.01);
  });
  it("calculates stated job profitability independently of tax", () => {
    const q = newQuote(defaults, []);
    q.status = "Accepted";
    q.lines = [
      { ...newLine("Other Costs", defaults), cost: 12300, override: 18500 },
    ];
    const j = convert(q);
    j.job!.actuals = [
      {
        id: "a",
        description: "Costs",
        category: "Materials",
        quantity: 1,
        cost: 13175,
      },
    ];
    const t = jobTotals(j);
    expect(t.profit).toBe(6200);
    expect(t.actualProfit).toBe(5325);
    expect(t.actualMargin).toBeCloseTo(28.78378);
    expect(t.variance).toBe(875);
  });
});
describe("quote lifecycle and validation", () => {
  it("deep snapshots the estimate and does not include actuals", () => {
    const q = seed().quotes[2];
    const j = convert(q);
    j.lines[0].cost = 999;
    j.pricing.hst = 0;
    j.job!.actuals.push({
      id: "a",
      description: "Extra",
      category: "Materials",
      quantity: 1,
      cost: 200,
    });
    expect(j.job!.snapshot.lines[0].cost).toBe(35);
    expect(j.job!.snapshot.pricing.hst).toBe(13);
    expect(calculate(j.job!.snapshot).cost).not.toBe(jobTotals(j).actual);
  });
  it("only converts accepted quotes once", () => {
    expect(() => convert(seed().quotes[0])).toThrow();
    expect(() => convert(convert(seed().quotes[2]))).toThrow();
  });
  it("duplicates as a new draft with a new number and no job actuals", () => {
    const s = seed();
    const q = duplicate(convert(s.quotes[2]), s.quotes);
    expect(q.status).toBe("Draft");
    expect(q.number).toBe("BW-1004");
    expect(q.job).toBeUndefined();
    expect(q.lines[0].id).not.toBe(s.quotes[2].lines[0].id);
  });
  it("rejects incomplete and invalid values", () => {
    const q = newQuote(defaults, []);
    expect(validate(q)).toContain("customer");
    q.customer.name = "Test";
    q.name = "Deck";
    q.lines = [
      { ...newLine("Labour", defaults), description: "Labour", cost: -1 },
    ];
    expect(validate(q)).toContain("non-negative");
    q.lines[0].cost = NaN;
    expect(validate(q)).toContain("non-negative");
  });
  it("starts business assumptions at zero and HST at 13%", () => {
    expect(defaults).toEqual({
      materialMarkup: 0,
      labourRate: 0,
      overhead: 0,
      contingency: 0,
      hst: 13,
    });
  });
});
