import { test, expect } from "@playwright/test";

test("durable storage rejects stale writes and retains committed data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Loading saved Backwoods projects…")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore, writeDurableStore } = await import(path);
    const original = await readDurableStore();
    if (!original) throw new Error("Missing initial snapshot");
    const next = { ...original, lastQuoteNumber: 9001 };
    await writeDurableStore(next, original);
    let rejected = false;
    try { await writeDurableStore({ ...original, lastQuoteNumber: 9002 }, original); }
    catch { rejected = true; }
    return { rejected, number: (await readDurableStore()).lastQuoteNumber };
  });
  expect(result).toEqual({ rejected: true, number: 9001 });
  await page.reload();
  await expect(page.getByText("Loading saved Backwoods projects…")).toHaveCount(0);
  const number = await page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore } = await import(path);
    return (await readDurableStore()).lastQuoteNumber;
  });
  expect(number).toBe(9001);
});

test("legacy migration preserves attachments and settings across reload", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("backwoods-quotes-v1")) {
      // Seed via the app's model in the test below, not private customer data.
      sessionStorage.setItem("migration-test", "pending");
    }
  });
  await page.goto("/");
  await expect(page.getByText("Loading saved Backwoods projects…")).toHaveCount(0);
  const expected = await page.evaluate(async () => {
    const modelPath = "/src/model.ts";
    const storagePath = "/src/durableStore.ts";
    const { seed, newQuote } = await import(modelPath);
    const { readDurableStore } = await import(storagePath);
    await readDurableStore();
    const store = seed();
    store.settings.labourRate = 97;
    const q = newQuote(store.settings, store.quotes);
    q.name = "Synthetic migration project";
    q.documents = [{ id: "test-document", name: "Synthetic.pdf", type: "application/pdf", data: "data:application/pdf;base64," + "A".repeat(1500000), addedAt: new Date().toISOString() }];
    store.quotes.push(q);
    localStorage.setItem("backwoods-quotes-v1", JSON.stringify(store));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("backwoods-quotes-durable-v1");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Database deletion blocked in isolated test"));
    });
    return { id: q.id, data: q.documents[0].data, count: store.quotes.length };
  });
  await page.reload();
  await expect(page.getByText("Loading saved Backwoods projects…")).toHaveCount(0);
  const actual = await page.evaluate(async (id) => {
    const path = "/src/durableStore.ts";
    const { readDurableStore } = await import(path);
    const store = await readDurableStore();
    const q = store.quotes.find((q: {id: string}) => q.id === id);
    return { data: q?.documents[0].data, count: store.quotes.length, rate: store.settings.labourRate };
  }, expected.id);
  expect(actual).toEqual({ data: expected.data, count: expected.count, rate: 97 });
});
