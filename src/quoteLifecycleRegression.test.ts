import { describe, it, expect } from "vitest";
import { seed, newQuote, newLine, calculate, markSent, estimateFor, convert, duplicate, jobTotals } from "./model";

describe("quote lifecycle regression", () => {
  it("calculates direct costs, markup, overhead, contingency and HST", () => {
    const p = { ...seed().settings, labourRate: 75, internalLabourCost: 35, materialMarkup: 15, overhead: 5, contingency: 3, hst: 13, targetMargin: 25 };
    const q = newQuote(p, []);
    q.lines = [
      { ...newLine("Labour", p), quantity: 10 },
      { ...newLine("Materials", p), quantity: 10, cost: 100 },
    ];
    const totals = calculate(q);
    expect(totals.cost).toBe(1350);
    expect(totals.base).toBe(1900);
    expect(totals.subtotal).toBe(2052);
    expect(totals.tax).toBe(266.76);
    expect(totals.total).toBe(2318.76);
    expect(totals.profit).toBe(702);
    expect(totals.targetPrice).toBe(1800);
  });

  it("locks sent prices and carries the original estimate into a job", () => {
    const q = seed().quotes[0];
    const sent = markSent(q);
    const original = calculate(estimateFor(sent));
    sent.pricing.labourRate = 999;
    sent.lines[0].quantity = 999;
    expect(calculate(estimateFor(sent))).toEqual(original);
    const job = convert({ ...sent, status: "Accepted" });
    expect(calculate(estimateFor(job))).toEqual(original);
    expect(() => convert(job)).toThrow();
    job.job!.actuals.push({ id: "actual", description: "Labour", category: "Labour", quantity: 2, cost: 35 });
    expect(jobTotals(job).actual).toBe(70);
    expect(jobTotals(job).actualProfit).toBe(original.subtotal - 70);
  });

  it("duplicates into an independent draft without changing the original", () => {
    const store = seed();
    const original = store.quotes[1];
    const before = structuredClone(original);
    const copy = duplicate(original, store.quotes, 2000);
    expect(copy.id).not.toBe(original.id);
    expect(copy.number).toBe("BW-2001");
    expect(copy.status).toBe("Draft");
    expect(copy.snapshot).toBeUndefined();
    copy.lines[0].quantity = 999;
    expect(original).toEqual(before);
  });
});
