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
