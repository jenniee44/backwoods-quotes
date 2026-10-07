import { describe, it, expect, vi, afterEach } from "vitest";
import {
  deleteQuote,
  persistQuoteDeletion,
  quoteNumberHighWater,
  newQuote,
  duplicate,
  seed,
  convert,
  migrate,
  jobTotals,
  calculate,
  storageKey,
  backupKey,
} from "./model";
import type { Store } from "./model";
function storage(store: Store, backup?: unknown) {
  const values = new Map([[storageKey, JSON.stringify(store)]]);
  if (backup) values.set(backupKey, JSON.stringify(backup));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}
afterEach(() => vi.unstubAllGlobals());
describe("permanent quote deletion", () => {
  it("removes quote-only plans, text, photos, takeoff and analysis without touching unrelated records", () => {
    const store = seed();
    const target = store.quotes[0];
    target.documents = [
      {
        id: "private-plan",
        name: "private-plan.pdf",
        type: "application/pdf",
        data: "data:application/pdf;base64,cHJpdmF0ZQ==",
        addedAt: "2026-10-07",
      },
    ];
    target.notes = "PRIVATE_QUOTE_ONLY_TEXT";
    target.photos = ["data:image/png;base64,cGhvdG8="];
    const before = structuredClone(store);
    const next = deleteQuote(store, target.id);
    expect(next.quotes).toEqual(before.quotes.slice(1));
    expect(next.settings).toEqual(before.settings);
    expect(next.quoteDefaults).toEqual(before.quoteDefaults);
    expect(next.company).toEqual(before.company);
    expect(store).toEqual(before); // Pure until caller confirms/persists.
    const values = storage(store);
    persistQuoteDeletion(next, target.id);
    expect(values.get(storageKey)).not.toContain("private-plan");
    expect(values.get(storageKey)).not.toContain("PRIVATE_QUOTE_ONLY_TEXT");
    expect(migrate(JSON.parse(values.get(storageKey)!)).quotes).toEqual(
      next.quotes,
    );
  });
  it("preserves an independent job's contract, estimate figures, actuals and change orders without quote analysis", () => {
    const store = seed();
    const target = convert(store.quotes.find((q) => q.status === "Accepted")!);
    target.job!.actuals = [
      {
        id: "actual",
        description: "Labour",
        category: "Labour",
        quantity: 10,
        cost: 30,
      },
    ];
    target.job!.changeOrders = [
      {
        id: "change",
        description: "Extra work",
        subtotal: 500,
        hst: 13,
        status: "Approved",
      },
    ];
    target.notes = "REMOVE_INTERNAL_NOTES";
    target.documents = [
      {
        id: "plan",
        name: "DELETE_ORIGINAL_PLAN.pdf",
        type: "application/pdf",
        data: "data:application/pdf;base64,cGxhbg==",
        addedAt: "2026-10-07",
      },
    ];
    target.job!.snapshot.lines[0].takeoffSource = {
      quantity: 1,
      unit: "each",
      notes: "private-item",
      documentName: "DELETE_ORIGINAL_PLAN.pdf",
      page: 1,
      confidence: "High",
    };
    store.quotes = store.quotes.map((q) => (q.id === target.id ? target : q));
    const totals = jobTotals(target);
    const next = deleteQuote(store, target.id);
    expect(next.quotes.some((q) => q.id === target.id)).toBe(false);
    const job = next.jobs![0];
    expect(job.customer).toEqual(target.customer);
    expect(job.job!.actuals).toEqual(target.job!.actuals);
    expect(job.job!.changeOrders).toEqual(target.job!.changeOrders);
    expect(calculate(job.job!.snapshot)).toEqual(
      calculate(target.job!.snapshot),
    );
    expect(jobTotals(job)).toEqual(totals);
    expect(job.documents).toEqual([]);
    expect(job.takeoff).toEqual([]);
    expect(job.analysisReports).toBeUndefined();
    expect(JSON.stringify(next)).not.toMatch(
      /REMOVE_INTERNAL_NOTES|DELETE_ORIGINAL_PLAN|private-item/,
    );
    expect(migrate(next).jobs).toEqual(next.jobs);
  });
  it("never reuses deleted highest numbers, even after reload, duplication or deleting every quote", () => {
    let store = seed();
    const max = quoteNumberHighWater(store);
    const source = store.quotes[0];
    const highest = store.quotes.find((q) => q.number === `BW-${max}`)!;
    store = deleteQuote(store, highest.id);
    const values = storage(store);
    persistQuoteDeletion(store, highest.id);
    store = migrate(JSON.parse(values.get(storageKey)!));
    expect(
      newQuote(
        store.settings,
        store.quotes,
        store.quoteDefaults,
        store.company,
        quoteNumberHighWater(store),
      ).number,
    ).toBe(`BW-${max + 1}`);
    expect(
      duplicate(source, store.quotes, quoteNumberHighWater(store)).number,
    ).toBe(`BW-${max + 1}`);
    for (const q of [...store.quotes]) store = deleteQuote(store, q.id);
    expect(store.quotes).toEqual([]);
    expect(quoteNumberHighWater(migrate(store))).toBe(max);
    expect(
      newQuote(
        store.settings,
        [],
        store.quoteDefaults,
        store.company,
        quoteNumberHighWater(store),
      ).number,
    ).toBe(`BW-${max + 1}`);
  });
  it("redacts the legacy backup quote but preserves unrelated backup records and fields", () => {
    const store = seed();
    const target = store.quotes[0];
    const backup = {
      version: 1,
      settings: store.settings,
      quotes: store.quotes,
      extra: "retain",
    };
    const values = storage(store, backup);
    persistQuoteDeletion(deleteQuote(store, target.id), target.id);
    expect(JSON.parse(values.get(backupKey)!)).toEqual({
      ...backup,
      quotes: backup.quotes.slice(1),
    });
    expect(JSON.parse(values.get(storageKey)!).quotes).toEqual(
      store.quotes.slice(1),
    );
  });
  it("does not overwrite invalid backups and rolls back backup redaction if primary storage fails", () => {
    const store = seed();
    const target = store.quotes[0];
    const values = storage(store, { invalid: true });
    const original = values.get(storageKey);
    expect(() =>
      persistQuoteDeletion(deleteQuote(store, target.id), target.id),
    ).toThrow();
    expect(values.get(storageKey)).toBe(original);
    const good = storage(store, { quotes: store.quotes });
    const backup = good.get(backupKey);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => good.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === storageKey) throw new Error("Storage unavailable");
        good.set(key, value);
      },
    });
    expect(() =>
      persistQuoteDeletion(deleteQuote(store, target.id), target.id),
    ).toThrow("Storage unavailable");
    expect(good.get(storageKey)).toBe(original);
    expect(good.get(backupKey)).toBe(backup);
  });
  it("fails safely for an unknown ID and rejects malformed saved job/number records", () => {
    const store = seed();
    expect(() => deleteQuote(store, "missing")).toThrow("no longer exists");
    expect(() => migrate({ ...store, lastQuoteNumber: -1 })).toThrow(
      "numbering",
    );
    expect(() => migrate({ ...store, jobs: [store.quotes[0]] })).toThrow(
      "job records",
    );
  });
});
