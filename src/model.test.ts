import { describe, it, expect } from "vitest";
import {
  calculate,
  convert,
  defaults,
  duplicate,
  jobTotals,
  linePrice,
  newLine as inheritedLine,
  newQuote,
  round,
  seed,
  validate,
} from "./model";
// Legacy formula tests use explicit overrides; inheritance has dedicated tests below.
const newLine = (
  kind: Parameters<typeof inheritedLine>[0],
  p: Parameters<typeof inheritedLine>[1],
) => ({
  ...inheritedLine(kind, p),
  inheritCost: false,
  inheritRate: false,
  inheritMarkup: false,
});
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
    expect(validate(q)).toBeNull();
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
    expect(defaults).toMatchObject({
      materialMarkup: 0,
      labourRate: 0,
      overhead: 0,
      contingency: 0,
      hst: 13,
    });
  });
});

// V2 tests exercise formulas, history and migration independently of the UI.
import {
  applyTemplate,
  deckTemplate,
  detailDefaults,
  estimateFor,
  markSent,
  migrate,
  purchaseQuantity,
  reviewWarnings,
  takeoffToLine,
  persist,
  load,
  storageKey,
  backupKey,
} from "./model";
import { customerRows } from "./customerDocument";
import { vi, afterEach } from "vitest";
afterEach(() => vi.unstubAllGlobals());
function v1Fixture() {
  const s = seed();
  const old = JSON.parse(JSON.stringify(s));
  old.version = 1;
  delete old.quoteDefaults;
  for (const k of [
    "internalLabourCost",
    "otherMarkup",
    "targetMargin",
    "validityDays",
  ])
    delete old.settings[k];
  for (const q of old.quotes) {
    delete q.details;
    delete q.snapshot;
    delete q.documents;
    delete q.takeoff;
    for (const l of q.lines) {
      delete l.waste;
      delete l.scopeGroup;
    }
    for (const k of [
      "internalLabourCost",
      "otherMarkup",
      "targetMargin",
      "validityDays",
    ])
      delete q.pricing[k];
  }
  return old;
}
describe("V2 cost and profitability formulas", () => {
  it("prices purchase quantities with waste separately from markup", () => {
    const l = {
      ...newLine("Materials", defaults),
      quantity: 40,
      waste: 10,
      cost: 18,
      markup: 15,
    };
    expect(purchaseQuantity(l)).toBe(44);
    expect(calculate({ lines: [l], pricing: defaults }).cost).toBe(792);
    expect(linePrice(l)).toBe(910.8);
    expect(linePrice({ ...l, override: 999 })).toBe(999);
  });
  it("marks up other costs and permits pass-through", () => {
    const l = {
      ...newLine("Other Costs", defaults),
      quantity: 2,
      cost: 100,
      markup: 15,
    };
    expect(linePrice(l)).toBe(230);
    expect(linePrice({ ...l, markup: 0 })).toBe(200);
  });
  it("breaks out direct costs and selling prices without double counting", () => {
    const p = { ...defaults, overhead: 10, contingency: 5, targetMargin: 30 };
    const lines = [
      { ...newLine("Labour", p), quantity: 10, cost: 30, rate: 75 },
      {
        ...newLine("Materials", p),
        quantity: 40,
        waste: 10,
        cost: 18,
        markup: 15,
      },
      { ...newLine("Other Costs", p), cost: 100, markup: 10 },
    ];
    const t = calculate({ lines, pricing: p });
    expect(t.labourCost).toBe(300);
    expect(t.materialCost).toBe(792);
    expect(t.otherCost).toBe(100);
    expect(t.base).toBe(1770.8);
    expect(t.overhead).toBe(177.08);
    expect(t.contingency).toBe(88.54);
    expect(t.subtotal).toBe(2036.42);
    expect(t.tax).toBe(264.73);
    expect(t.profit).toBe(844.42);
    expect(t.breakEven).toBe(1192);
    expect(t.targetPrice).toBe(1702.86);
  });
  it("uses cost / (1 - margin), rounds upward, and warns below target", () => {
    const t = calculate({
      lines: [{ ...newLine("Other Costs", defaults), cost: 100 }],
      pricing: { ...defaults, targetMargin: 30 },
    });
    expect(t.targetPrice).toBe(142.86);
    expect(t.belowTarget).toBe(true);
    expect(
      calculate({ lines: [], pricing: { ...defaults, targetMargin: 100 } })
        .targetPrice,
    ).toBeNull();
    const q = newQuote({ ...defaults, targetMargin: 100 }, []);
    expect(validate(q)).toContain("less than 100");
  });
  it("inherits defaults by value, expiry and labour/other-cost defaults", () => {
    const p = {
      ...defaults,
      internalLabourCost: 35,
      labourRate: 85,
      otherMarkup: 12,
      validityDays: 14,
    };
    const q = newQuote(p, [], { ...detailDefaults, payment: "20% deposit" });
    expect(newLine("Labour", q.pricing).cost).toBe(35);
    expect(newLine("Other Costs", q.pricing).markup).toBe(12);
    const days =
      (new Date(q.expiry + "T12:00:00Z").getTime() -
        new Date(q.date + "T12:00:00Z").getTime()) /
      86400000;
    expect(days).toBe(14);
    p.labourRate = 99;
    expect(q.pricing.labourRate).toBe(85);
    expect(q.details.payment).toBe("20% deposit");
  });
});
describe("V2 migration and historical quotes", () => {
  it("preserves every V1 price, customers, photos, notes, numbers and actuals without mutating input", () => {
    const old = v1Fixture();
    old.quotes[0].notes = "Keep me";
    old.quotes[0].photos = ["data:image/png;base64,aGVsbG8="];
    old.quotes[0].lines.push({
      ...newLine("Other Costs", defaults),
      markup: 15,
      cost: 100,
    });
    const before = JSON.stringify(old);
    const migrated = migrate(old);
    expect(JSON.stringify(old)).toBe(before);
    expect(migrated.version).toBe(2);
    expect(migrated.quotes[0].notes).toBe("Keep me");
    expect(migrated.quotes[0].photos).toEqual(old.quotes[0].photos);
    expect(migrated.quotes[0].lines.at(-1)!.markup).toBe(0);
    expect(migrated.quotes[1].snapshot).toBeDefined();
    expect(migrated.quotes[2].number).toBe(old.quotes[2].number);
    for (let i = 0; i < 3; i++)
      expect(calculate(migrated.quotes[i]).subtotal).toBe(
        calculate({
          ...old.quotes[i],
          lines: old.quotes[i].lines.map((l: ReturnType<typeof newLine>) => ({
            ...l,
            markup: l.kind === "Other Costs" ? 0 : l.markup,
          })),
        }).subtotal,
      );
  });
  it("preserves historical job snapshot and actual costs", () => {
    const old = v1Fixture();
    const q = old.quotes[2];
    q.job = {
      snapshot: {
        lines: structuredClone(q.lines),
        pricing: structuredClone(q.pricing),
      },
      convertedAt: "2026-01-01",
      actuals: [
        {
          id: "actual",
          description: "Labour",
          category: "Labour",
          quantity: 12,
          cost: 35,
        },
      ],
    };
    const result = migrate(old).quotes[2];
    expect(result.job!.actuals).toEqual(q.job.actuals);
    expect(jobTotals(result).actual).toBe(420);
    expect(calculate(estimateFor(result)).subtotal).toBe(
      calculate(q.job.snapshot).subtotal,
    );
  });
  it("backs up original V1 bytes before saving V2 and migrates idempotently", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    });
    const old = JSON.stringify(v1Fixture());
    data.set(storageKey, old);
    const migrated = load();
    expect(data.get(storageKey)).toBe(old);
    persist(migrated);
    expect(data.get(backupKey)).toBe(old);
    expect(load()).toEqual(migrated);
    expect(migrate(migrated)).toEqual(migrated);
  });
  it("does not overwrite V1 if backup cannot be stored", () => {
    const old = JSON.stringify(v1Fixture());
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k === storageKey ? old : null),
      setItem: () => {
        throw new Error("Storage full");
      },
    });
    expect(() => persist(migrate(JSON.parse(old)))).toThrow("Storage full");
    expect(localStorage.getItem(storageKey)).toBe(old);
  });
  it("freezes a sent snapshot and converts from that snapshot", () => {
    const q = seed().quotes[0];
    const sent = markSent(q);
    const price = calculate(estimateFor(sent)).subtotal;
    sent.lines[0].cost = 999;
    sent.pricing.hst = 0;
    expect(calculate(estimateFor(sent)).subtotal).toBe(price);
    expect(estimateFor(sent).pricing.hst).toBe(13);
    const job = convert({ ...sent, status: "Accepted" });
    expect(job.job!.snapshot).toEqual(sent.snapshot);
    expect(() => markSent(sent)).toThrow();
  });
});
describe("V2 templates, takeoff and customer privacy", () => {
  it("appends editable Deck suggestions without preset quantities or prices", () => {
    const q = seed().quotes[0];
    const applied = applyTemplate(q, deckTemplate);
    expect(
      applied.lines
        .slice(q.lines.length)
        .every(
          (l) =>
            l.quantity === 0 && l.cost === 0 && l.rate === 0 && l.markup === 0,
        ),
    ).toBe(true);
    expect(applied.lines.at(-1)!.scopeGroup).toBe("Project Costs");
    expect(() => applyTemplate(seed().quotes[1], deckTemplate)).toThrow();
  });
  it("requires takeoff review and prevents double conversion", () => {
    const q = newQuote(defaults, []);
    const item = {
      id: "t",
      description: "Deck boards",
      quantity: 40,
      unit: "board",
      documentId: "p",
      page: 1,
      notes: "Measured",
      status: "Proposed" as const,
      confidence: "Medium" as const,
    };
    q.takeoff = [item];
    expect(() => takeoffToLine(q, item, "Materials")).toThrow();
    q.takeoff[0] = { ...item, status: "Reviewed" };
    const converted = takeoffToLine(q, q.takeoff[0], "Materials");
    expect(converted.lines[0].quantity).toBe(40);
    expect(converted.lines[0].takeoffId).toBe("t");
    expect(() =>
      takeoffToLine(converted, converted.takeoff[0], "Labour"),
    ).toThrow();
  });
  it("customer projection never includes internal costing, waste or private notes", () => {
    const q = seed().quotes[0];
    q.notes = "SECRET";
    q.lines.forEach((l) => (l.scopeGroup = "Decking"));
    q.details.groupLines = true;
    const rows = customerRows(q);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(calculate(q).subtotal);
    q.details.showQuantities = true;
    const quantities = customerRows(q);
    expect(quantities[0].quantities).toEqual(["40 each"]);
    expect(JSON.stringify(rows)).not.toMatch(
      /SECRET|markup|cost|rate|waste|profit|margin/,
    );
    q.details.showQuantities = false;
    expect(customerRows(q)[0].quantities).toEqual([]);
    q.details.showLabourHours = true;
    expect(customerRows(q)[0].quantities).toEqual(["40 hours"]);
  });
  it("drafts can save missing business information, but sent checklist reports it", () => {
    const q = newQuote({ ...defaults, targetMargin: 30 }, []);
    expect(validate(q)).toBeNull();
    expect(reviewWarnings(q)).toEqual(
      expect.arrayContaining([
        "Missing customer name",
        "Missing scope of work",
        "No labour lines",
        "No materials lines",
        "Expected gross margin is below target",
        "Missing payment / deposit schedule",
        "Missing quote expiry",
      ]),
    );
  });
});
it("generates valid UUIDs on iPhone LAN previews without randomUUID", async () => {
  const original = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal("crypto", { getRandomValues: original });
  const { id } = await import("./model");
  expect(id()).toMatch(
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  expect(id()).not.toBe(id());
});

import {
  groupsFor,
  constructionTemplates,
  effectiveLine,
  expiryFor,
  responsibilityText,
  changeOrderTotals,
} from "./model";
describe("V2 testing refinements", () => {
  it("inherits quote defaults and replaces them with line overrides without double markup", () => {
    const p = {
      ...defaults,
      materialMarkup: 20,
      otherMarkup: 15,
      internalLabourCost: 35,
      labourRate: 90,
    };
    const material = { ...inheritedLine("Materials", p), cost: 100 };
    expect(calculate({ lines: [material], pricing: p }).subtotal).toBe(120);
    expect(
      calculate({
        lines: [{ ...material, markup: 10, inheritMarkup: false }],
        pricing: p,
      }).subtotal,
    ).toBe(110);
    expect(
      calculate({
        lines: [{ ...material, markup: 0, inheritMarkup: false }],
        pricing: p,
      }).subtotal,
    ).toBe(100);
    const other = { ...inheritedLine("Other Costs", p), cost: 100 };
    expect(calculate({ lines: [other], pricing: p }).subtotal).toBe(115);
    const labour = { ...inheritedLine("Labour", p), quantity: 10 };
    expect(calculate({ lines: [labour], pricing: p }).cost).toBe(350);
    expect(calculate({ lines: [labour], pricing: p }).subtotal).toBe(900);
    expect(
      effectiveLine({ ...labour, rate: 75, inheritRate: false }, p).rate,
    ).toBe(75);
  });
  it("quote changes update inherited lines while legacy lines and overrides retain their values", () => {
    const q = newQuote({ ...defaults, materialMarkup: 20 }, []);
    q.lines = [
      { ...inheritedLine("Materials", q.pricing), cost: 100 },
      { ...newLine("Materials", defaults), cost: 100, markup: 10 },
    ];
    q.pricing.materialMarkup = 30;
    expect(calculate(q).subtotal).toBe(240);
    const sent = markSent(q);
    q.pricing.materialMarkup = 90;
    expect(calculate(estimateFor(sent)).subtotal).toBe(240);
  });
  it("combines kinds into one customer scope and distributes all internal additions exactly", () => {
    const q = newQuote({ ...defaults, overhead: 5, contingency: 3 }, []);
    q.lines = ["Labour", "Materials", "Other Costs"].map((kind, i) => ({
      ...newLine(kind as "Labour" | "Materials" | "Other Costs", defaults),
      scopeGroup: "Framing",
      description: `Secret internal row ${i}`,
      quantity: 1,
      cost: 100,
      rate: 100,
    }));
    const rows = customerRows(q);
    expect(rows).toEqual([
      { description: "Framing", scopeText: "", amount: 324, quantities: [] },
    ]);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(calculate(q).subtotal);
    q.details.exposeContingency = true;
    expect(customerRows(q)).toEqual([
      { description: "Framing", scopeText: "", amount: 315, quantities: [] },
      { description: "Contingency allowance", amount: 9, quantities: [] },
    ]);
  });
  it("allocates fractional-cent additions so many groups reconcile to subtotal", () => {
    const q = newQuote({ ...defaults, overhead: 7.3, contingency: 2.1 }, []);
    q.lines = Array.from({ length: 17 }, (_, i) => ({
      ...newLine("Materials", defaults),
      scopeGroup: `Group ${i}`,
      cost: 0.23,
    }));
    expect(round(customerRows(q).reduce((s, r) => s + r.amount, 0))).toBe(
      calculate(q).subtotal,
    );
  });
  it("stores quote-specific template/custom groups without deck contamination", () => {
    const q = newQuote(defaults, []);
    expect(groupsFor(q)).toEqual([]);
    const reno = applyTemplate(
      q,
      constructionTemplates.find((t) => t.id === "renovation")!,
    );
    expect(groupsFor(reno)).toContain("Framing");
    expect(groupsFor(reno)).not.toContain("Decking");
    reno.lines.push({
      ...newLine("Labour", defaults),
      scopeGroup: "Custom masonry",
    });
    expect(groupsFor(reno)).toContain("Custom masonry");
    expect(constructionTemplates).toHaveLength(12);
  });
  it("calculates expiry across month and year boundaries and handles optional validity", () => {
    expect(expiryFor("2026-12-20", 30)).toBe("2027-01-19");
    expect(expiryFor("2026-02-20", 14)).toBe("2026-03-06");
    expect(expiryFor("2026-10-06", 0)).toBe("");
  });
  it("timestamps sent quotes and keeps templates from changing snapshots", () => {
    const q = applyTemplate(seed().quotes[0], constructionTemplates[1]);
    const sent = markSent(q);
    expect(sent.sentAt).toMatch(/^\d{4}-/);
    const snapshot = structuredClone(sent.snapshot);
    q.lines[0].quantity = 999;
    expect(sent.snapshot).toEqual(snapshot);
  });
  it("keeps supplier, SKU, notes and cost metadata private", () => {
    const q = seed().quotes[0];
    q.details.groupLines = true;
    q.lines[1] = {
      ...q.lines[1],
      supplier: "SECRET SUPPLIER",
      sku: "SECRET SKU",
      materialNotes: "SECRET NOTES",
    };
    expect(JSON.stringify(customerRows(q))).not.toMatch(
      /SECRET|supplier|sku|materialNotes|markup|profit/,
    );
  });
  it("polishes short responsibility values while preserving complete custom wording", () => {
    expect(responsibilityText("permits", "homeowner")).toBe(
      "Unless specifically included in the scope above, required permits and associated fees are the responsibility of the homeowner.",
    );
    expect(responsibilityText("engineering", "contractor")).toContain(
      "engineering services",
    );
    expect(
      responsibilityText("permits", "We will obtain the required permits."),
    ).toBe("We will obtain the required permits.");
  });
  it("calculates separate change order values without mutating a quote", () => {
    const q = seed().quotes[2];
    const before = JSON.stringify(q);
    expect(
      changeOrderTotals({
        id: "co",
        description: "Added scope",
        subtotal: 1000,
        hst: 13,
        status: "Draft",
      }),
    ).toEqual({ subtotal: 1000, tax: 130, total: 1130 });
    expect(JSON.stringify(q)).toBe(before);
  });
});

describe("construction template regression", () => {
  for (const template of constructionTemplates) {
    it(`${template.name}: correct catalog, zero quantities and idempotent application`, () => {
      const q = newQuote(defaults, []);
      const applied = applyTemplate(q, template);
      expect(applied.lines.map((l) => l.description)).toEqual(
        template.lines.map((l) => l.description),
      );
      expect(applied.scopeGroups).toEqual([...new Set(template.groups)]);
      expect(
        applied.lines.every(
          (l) => l.quantity === 0 && l.cost === 0 && l.override === null,
        ),
      ).toBe(true);
      expect(applyTemplate(applied, template)).toBe(applied);
      expect(new Set(applied.lines.map((l) => l.id)).size).toBe(
        applied.lines.length,
      );
      expect(calculate(applied).total).toBe(0);
      if (template.id !== "deck")
        expect(applied.scopeGroups).not.toContain("Footings & Structure");
      if (template.id === "deck")
        expect(applied.scopeGroups).toContain("Footings & Structure");
    });
  }
  it("retains user edits and application history when templates are mixed or duplicated", () => {
    const q = applyTemplate(newQuote(defaults, []), constructionTemplates[1]);
    q.lines[0].quantity = 12;
    const mixed = applyTemplate(q, constructionTemplates[2]);
    expect(applyTemplate(mixed, constructionTemplates[1]).lines).toEqual(
      mixed.lines,
    );
    expect(mixed.lines[0].quantity).toBe(12);
    expect(
      applyTemplate(duplicate(mixed, [mixed]), constructionTemplates[1]).lines,
    ).toHaveLength(mixed.lines.length);
  });
  it("snapshots all company defaults and isolates quote and line overrides", () => {
    const settings = {
      ...defaults,
      labourRate: 90,
      internalLabourCost: 35,
      materialMarkup: 20,
      otherMarkup: 15,
      overhead: 10,
      contingency: 5,
      targetMargin: 25,
      hst: 13,
    };
    const q = newQuote(settings, []);
    expect(q.pricing).toEqual(settings);
    settings.labourRate = 200;
    expect(q.pricing.labourRate).toBe(90);
    const second = newQuote(settings, [q]);
    q.pricing.labourRate = 100;
    expect(second.pricing.labourRate).toBe(200);
    q.lines = [
      inheritedLine("Labour", q.pricing),
      inheritedLine("Labour", q.pricing),
    ];
    q.lines.forEach((l) => (l.quantity = 2));
    q.lines[0].inheritRate = false;
    q.lines[0].rate = 120;
    expect(linePrice(q.lines[0], q.pricing)).toBe(240);
    expect(linePrice(q.lines[1], q.pricing)).toBe(200);
    expect(calculate(q).tax).toBe(round(calculate(q).subtotal * 0.13));
  });
});

it("recognizes previously applied V2 catalogs without application history", () => {
  const q = applyTemplate(newQuote(defaults, []), deckTemplate);
  delete q.appliedTemplateIds;
  q.lines[0].quantity = 10;
  expect(applyTemplate(q, deckTemplate)).toBe(q);
});

import { categories, normalizeCategory } from "./model";
describe("trade categories", () => {
  it("uses the exact clean catalog without role or duplicate options", () => {
    expect(categories).toEqual([
      "Plumbing",
      "Electrical",
      "HVAC",
      "Drywall",
      "Painting",
      "Tiling",
      "Roofing",
      "Excavation",
      "Concrete / Masonry",
      "Other Subcontractor",
      "Equipment Rental",
      "Dump / Disposal Fees",
      "Delivery",
      "Permit",
      "Engineering",
      "Travel",
      "Miscellaneous",
    ]);
    expect(inheritedLine("Other Costs", defaults).category).toBe(
      "Other Subcontractor",
    );
  });
  for (const template of constructionTemplates) {
    it(`${template.name} suggestions use canonical categories and correct trades`, () => {
      for (const line of template.lines.filter(
        (l) => l.kind === "Other Costs",
      )) {
        expect(categories).toContain(line.category);
        if (line.scopeGroup === "Plumbing")
          expect(line.category).toBe("Plumbing");
        if (line.scopeGroup === "Electrical")
          expect(line.category).toBe("Electrical");
        if (line.scopeGroup === "HVAC") expect(line.category).toBe("HVAC");
        if (line.scopeGroup === "Excavation")
          expect(line.category).toBe("Excavation");
      }
    });
  }
  it("maps old labels conservatively without touching prices, snapshots or original data", () => {
    const store = seed();
    const q = store.quotes[0];
    q.lines = [
      "Subcontractor",
      "Subcontractors",
      "Equipment rentals",
      "Dump/disposal fees",
      "Permits",
      "Custom historical category",
    ].map((category, i) => ({
      ...newLine("Other Costs", q.pricing),
      category,
      description: i === 0 ? "Licensed plumber" : "Allowance",
      quantity: 2,
      cost: 123,
      markup: 17,
    }));
    q.snapshot = structuredClone({ lines: q.lines, pricing: q.pricing });
    q.job = {
      snapshot: structuredClone(q.snapshot),
      convertedAt: new Date().toISOString(),
      actuals: [
        {
          id: "actual",
          category: "Subcontractors",
          description: "Electrical subcontractor",
          quantity: 1,
          cost: 456,
        },
      ],
    };
    const original = structuredClone(store);
    const result = migrate(store);
    expect(result.quotes[0].lines.map((l) => l.category)).toEqual([
      "Plumbing",
      "Other Subcontractor",
      "Equipment Rental",
      "Dump / Disposal Fees",
      "Permit",
      "Custom historical category",
    ]);
    expect(calculate(result.quotes[0])).toEqual(calculate(q));
    expect(calculate(result.quotes[0].snapshot!)).toEqual(
      calculate(q.snapshot),
    );
    expect(jobTotals(result.quotes[0])).toEqual(jobTotals(q));
    expect(result.quotes[0].job!.actuals[0].category).toBe("Electrical");
    expect(result.quotes[0].snapshot!.lines[0].category).toBe("Plumbing");
    expect(result.quotes[0].job!.snapshot.lines[0].category).toBe("Plumbing");
    expect(store).toEqual(original);
    expect(migrate(result)).toEqual(result);
    expect(
      normalizeCategory("Subcontractor", "Plumbing and electrical allowance"),
    ).toBe("Other Subcontractor");
  });
});

it("Bathroom Renovation includes practical wall preparation and finishing stages at zero", () => {
  const template = constructionTemplates.find((t) => t.id === "bathroom")!;
  const q = applyTemplate(newQuote(defaults, []), template);
  expect(
    q.lines.find(
      (l) => l.description === "Drywall / board installation labour",
    ),
  ).toMatchObject({
    kind: "Labour",
    unit: "hour",
    scopeGroup: "Drywall & Wall Preparation",
    quantity: 0,
    cost: 0,
  });
  expect(q.scopeGroups).toEqual(
    expect.arrayContaining([
      "Bathroom Preparation",
      "Framing & Blocking",
      "Floor Preparation",
      "Drywall & Wall Preparation",
      "Waterproofing",
      "Tiling",
      "Fixtures",
      "Trim & Finishing",
      "Painting",
      "Sealing & Caulking",
      "Final Cleanup & Checks",
      "Electrical",
      "Plumbing",
      "HVAC",
    ]),
  );
  expect(
    q.lines.every(
      (l) =>
        l.quantity === 0 && l.cost === 0 && l.rate === 0 && l.override === null,
    ),
  ).toBe(true);
  expect(calculate(q).total).toBe(0);
  const saved = structuredClone(q);
  saved.lines = saved.lines.filter(
    (l) => l.scopeGroup !== "Drywall & Wall Preparation",
  );
  saved.lines[0].quantity = 12;
  const before = structuredClone(saved);
  expect(applyTemplate(saved, template)).toBe(saved);
  expect(saved).toEqual(before);
  const store = seed();
  store.quotes = [saved];
  expect(migrate(store).quotes[0]).toEqual(before);
});

import { customerDocument, customerScopesFor } from "./customerDocument";
import { addAnalysisSuggestions } from "./planAnalysis";
import { paymentError, companyDefaults } from "./model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerQuote from "./CustomerQuote";
describe("customer document and readiness refinements", () => {
  it("hides zero scopes and rolls bathroom rows into broad editable scopes without changing totals", () => {
    const q = applyTemplate(
      newQuote(
        { ...defaults, labourRate: 100, overhead: 10, contingency: 5 },
        [],
      ),
      constructionTemplates.find((t) => t.id === "bathroom")!,
    );
    const drywall = q.lines.find(
      (l) => l.description === "Drywall / board installation labour",
    )!;
    drywall.quantity = 2;
    const prep = q.lines.find(
      (l) => l.scopeGroup === "Floor Preparation" && l.kind === "Labour",
    )!;
    prep.quantity = 1;
    expect(customerRows(q)).toHaveLength(1);
    expect(customerRows(q)[0]).toMatchObject({
      description: "Framing & Wall Preparation",
      amount: 345,
    });
    expect(JSON.stringify(customerRows(q))).not.toContain("HVAC");
    q.customerScopes = customerScopesFor(q).map((scope) =>
      scope.label === "Framing & Wall Preparation"
        ? {
            ...scope,
            label: "Walls and floors",
            description: "Prepare agreed walls and floors.",
          }
        : scope,
    );
    expect(customerRows(q)[0]).toMatchObject({
      description: "Walls and floors",
      scopeText: "Prepare agreed walls and floors.",
    });
    expect(calculate(q).subtotal).toBe(345);
  });
  it("projects only allowed customer values and suppresses known helper placeholders", () => {
    const q = newQuote(defaults, []);
    q.name = "Public project";
    q.description = "Public agreed scope";
    q.notes = "PRIVATE NOTES";
    q.details.assumptions =
      "Leave blank as a company default. These are usually job-specific.";
    q.details.exclusions =
      "Leave blank as a default for now. We can eventually create better standard exclusions.";
    q.lines = [
      {
        ...newLine("Materials", defaults),
        description: "PRIVATE RECIPE",
        scopeGroup: "Customer scope",
        quantity: 2,
        cost: 30,
        markup: 50,
        materialNotes: "PRIVATE MATERIAL NOTES",
        supplier: "PRIVATE SUPPLIER",
        takeoffSource: {
          documentName: "PRIVATE DRAWING",
          page: 1,
          quantity: 2,
          unit: "each",
          notes: "PRIVATE TAKEOFF NOTES",
          confidence: "Low",
        },
      },
    ];
    q.takeoff = [
      {
        id: "takeoff",
        documentId: "d",
        page: 1,
        description: "PRIVATE MEASUREMENT",
        quantity: 2,
        unit: "each",
        notes: "PRIVATE TAKEOFF NOTES",
        status: "Proposed",
        confidence: "Low",
      },
    ];
    const projected = JSON.stringify(customerDocument(q));
    expect(projected).not.toMatch(
      /PRIVATE|leave blank|eventually|markup|margin|profit|labourRate|materialNotes|cost/i,
    );
    for (const mode of ["Simplified", "Detailed"] as const) {
      q.mode = mode;
      const markup = renderToStaticMarkup(
        createElement(CustomerQuote, {
          quote: q,
          onClose: () => {},
          onMode: () => {},
          onDetails: () => {},
        }),
      );
      const article = markup.slice(markup.indexOf("<article"));
      expect(article).toContain("Public project");
      expect(article).not.toMatch(
        /PRIVATE|leave blank|eventually|markup|margin|profit|hourly/i,
      );
      expect(article).toContain("$90.00");
      expect(article).toContain("$11.70");
      expect(article).toContain("$101.70");
      if (mode === "Simplified")
        expect(article).not.toContain("Customer scope");
      else expect(article).toContain("Customer scope");
    }
  });
  it("omits all unused rows when a template has not been priced", () => {
    const q = applyTemplate(
      newQuote(defaults, []),
      constructionTemplates.find((t) => t.id === "bathroom")!,
    );
    expect(customerRows(q)).toEqual([]);
  });
  it("validates percentage payment schedules without inventing default payments", () => {
    expect(
      paymentError("20% acceptance, 30% start, 30% midpoint, 20% completion"),
    ).toBeNull();
    expect(
      paymentError("33.33% start, 33.33% midpoint, 33.34% completion"),
    ).toBeNull();
    expect(paymentError("20% deposit, 70% completion")).toContain(
      "currently 90%",
    );
    expect(paymentError("")).toBeNull();
    expect(paymentError("Payment upon completion")).toBeNull();
    const q = newQuote(defaults, []);
    q.details.payment = "20% deposit";
    expect(validate(q)).toContain("100%");
  });
  it("snapshots company contact and document defaults for new quotes", () => {
    const company = { ...companyDefaults, phone: "555-1234" };
    const options = {
      ...seed().quoteDefaults,
      payment: "100% on completion",
      assumptions: "Public assumption",
    };
    const q = newQuote(defaults, [], options, company);
    company.phone = "555-9999";
    options.payment = "50% start, 50% finish";
    expect(q.company!.phone).toBe("555-1234");
    expect(q.details.payment).toBe("100% on completion");
    const store = seed();
    store.quotes = [q];
    store.company = company;
    expect(migrate(store).quotes[0].company).toEqual(q.company);
    const old = seed();
    delete old.company;
    old.quotes.forEach((item) => {
      delete item.company;
      delete item.customerScopes;
    });
    expect(migrate(old).quotes).toEqual(old.quotes);
  });
  it("preserves source traceability after approval/conversion/removal and rejects unapproved analysis", () => {
    const q = newQuote(defaults, []);
    q.documents = [
      {
        id: "drawing",
        name: "Deck Plan",
        type: "image/png",
        data: "data:image/png;base64,AA==",
        addedAt: new Date().toISOString(),
      },
    ];
    const suggestion = {
      description: "Deck area",
      quantity: 384,
      unit: "sq. ft.",
      documentId: "drawing",
      page: 2,
      notes: "Confirm dimensions on site",
      confidence: "Low" as const,
    };
    const proposed = addAnalysisSuggestions(q, {
      suggestions: [{ ...suggestion, status: "Reviewed" } as typeof suggestion],
      warnings: [],
    });
    expect(proposed.takeoff[0].status).toBe("Proposed");
    expect(() =>
      takeoffToLine(proposed, proposed.takeoff[0], "Materials"),
    ).toThrow();
    proposed.takeoff[0].status = "Approved";
    proposed.takeoff[0].reviewAcknowledged = true;
    proposed.takeoff[0].destination = "Materials";
    proposed.takeoff[0].workScope = "New work";
    proposed.takeoff[0].included = true;
    proposed.takeoff[0].scopeVerified = true;
    const converted = takeoffToLine(proposed, proposed.takeoff[0], "Materials");
    converted.documents = [];
    converted.takeoff = [];
    expect(converted.lines[0].takeoffSource).toMatchObject({
      documentName: "Deck Plan",
      page: 2,
      quantity: 384,
      notes: "Confirm dimensions on site",
    });
    expect(() =>
      addAnalysisSuggestions(q, {
        suggestions: [{ ...suggestion, documentId: "unknown" }],
        warnings: [],
      }),
    ).toThrow();
  });
  it("target margin advice excludes HST and never changes quote price", () => {
    const q = newQuote({ ...defaults, targetMargin: 25 }, []);
    q.lines = [
      {
        ...newLine("Materials", defaults),
        quantity: 1,
        cost: 800,
        override: 1000,
      },
    ];
    const t = calculate(q);
    expect(t.profit).toBe(200);
    expect(t.margin).toBe(20);
    expect(t.belowTarget).toBe(true);
    expect(t.targetPrice).toBe(1066.67);
    expect(t.total).toBe(1130);
    expect(q.lines[0].override).toBe(1000);
  });
});
