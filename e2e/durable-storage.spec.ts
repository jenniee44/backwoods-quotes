import { test, expect } from "@playwright/test";
import { newQuote, seed, storageKey } from "../src/model";
import { readWorkspace } from "./fixtures/readWorkspace";

test("durable storage rejects stale writes and retains committed data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("Loading saved Backwoods projects…")).toHaveCount(
    0,
  );
  const result = await page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore, writeDurableStore } = await import(path);
    const original = await readDurableStore();
    if (!original) throw new Error("Missing initial snapshot");
    const next = { ...original, lastQuoteNumber: 9001 };
    await writeDurableStore(next, original);
    let rejected = false;
    try {
      await writeDurableStore({ ...original, lastQuoteNumber: 9002 }, original);
    } catch {
      rejected = true;
    }
    return { rejected, number: (await readDurableStore()).lastQuoteNumber };
  });
  expect(result).toEqual({ rejected: true, number: 9001 });
  await page.reload();
  await expect(page.getByText("Loading saved Backwoods projects…")).toHaveCount(
    0,
  );
  const number = await page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore } = await import(path);
    return (await readDurableStore()).lastQuoteNumber;
  });
  expect(number).toBe(9001);
});

test("legacy migration preserves attachments and settings across reload", async ({
  page,
}) => {
  const store = seed();
  store.settings.labourRate = 97;
  const quote = newQuote(store.settings, store.quotes);
  quote.name = "Synthetic migration project";
  const data = "data:application/pdf;base64," + "A".repeat(1500000);
  quote.documents = [
    {
      id: "test-document",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data,
      addedAt: "2026-01-01",
    },
  ];
  store.quotes.push(quote);
  await page.route("**/__legacy-test-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Legacy fixture</title>",
    }),
  );
  await page.goto("/__legacy-test-fixture");
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: storageKey,
    raw: JSON.stringify(store),
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your work, at a glance." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("Loading saved Backwoods projects…")).toHaveCount(
    0,
  );
  const saved = await readWorkspace(page);
  const migrated = saved.quotes.find((record) => record.id === quote.id);
  expect(migrated?.documents[0].data).toBe(data);
  expect(saved.quotes).toHaveLength(store.quotes.length);
  expect(saved.settings.labourRate).toBe(97);
});

test("workspace recovery restores settings without removing projects", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const backup = await page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore, writeDurableStore } = await import(path);
    const store = await readDurableStore();
    await writeDurableStore({ ...store, lastQuoteNumber: 9001 }, store);
    return { ...store, settings: { ...store.settings, labourRate: 123 } };
  });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .locator('input[type="file"][accept=".json,application/json"]')
    .setInputFiles({
      name: "synthetic-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(
    page.getByText("Backup workspace restored.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByLabel("Customer labour rate ($/hour)", { exact: true }),
  ).toHaveValue("123");
  const actual = await page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore } = await import(path);
    return await readDurableStore();
  });
  expect(actual.quotes).toEqual(backup.quotes);
  expect(actual.settings.labourRate).toBe(123);
  expect(actual.lastQuoteNumber).toBe(9001);
});

test("a corrupt legacy record blocks startup and remains available for recovery", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("backwoods-quotes-v1", "");
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText(
    "Durable storage unavailable",
  );
  await expect(
    page.getByRole("button", { name: "Create New Quote" }),
  ).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore } = await import(path);
    return {
      legacy: localStorage.getItem("backwoods-quotes-v1"),
      durable: await readDurableStore(),
    };
  });
  expect(result).toEqual({ legacy: "", durable: null });
});

test("concurrent tabs preserve the winning commit and reject the stale writer", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByText("Loading saved Backwoods projects…")).toHaveCount(
    0,
  );
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByText("Loading saved Backwoods projects…"),
  ).toHaveCount(0);

  const original = await page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore } = await import(path);
    return readDurableStore();
  });
  const attempts = await Promise.allSettled(
    [page, other].map((tab, index) =>
      tab.evaluate(
        async ({ original, number }) => {
          const path = "/src/durableStore.ts";
          const { writeDurableStore } = await import(path);
          await writeDurableStore(
            { ...original, lastQuoteNumber: number },
            original,
          );
          return number;
        },
        { original, number: 9001 + index },
      ),
    ),
  );
  const commits = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejections = attempts.filter(
    (attempt) => attempt.status === "rejected",
  );
  expect(commits).toHaveLength(1);
  expect(rejections).toHaveLength(1);
  expect(String(rejections[0].reason)).toContain("Saved data changed");

  await other.reload();
  await expect(
    other.getByText("Loading saved Backwoods projects…"),
  ).toHaveCount(0);
  const number = await other.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore } = await import(path);
    return (await readDurableStore()).lastQuoteNumber;
  });
  expect(number).toBe(commits[0].value);
});

test("tabs starting together hydrate one legacy workspace", async ({
  context,
  page,
}) => {
  const legacy = seed();
  legacy.settings.labourRate = 97;
  await context.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: storageKey, raw: JSON.stringify(legacy) },
  );
  const other = await context.newPage();
  await Promise.all([page.goto("/"), other.goto("/")]);
  for (const tab of [page, other]) {
    await expect(
      tab.getByRole("heading", { name: "Your work, at a glance." }),
    ).toBeVisible();
    const hydrated = await readWorkspace(tab);
    expect(hydrated.quotes.map((quote) => quote.id)).toEqual(
      legacy.quotes.map((quote) => quote.id),
    );
    expect(hydrated.settings.labourRate).toBe(97);
  }
});

test("conflicting full restore refuses writes and add-missing preserves active pricing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const before = await readWorkspace(page);
  const extra = newQuote(before.settings, before.quotes);
  extra.name = "Synthetic restored project";
  const incoming = {
    ...before,
    quotes: before.quotes
      .map((quote, i) =>
        i === 0 ? { ...quote, name: "Conflicting replacement" } : quote,
      )
      .concat(extra),
    settings: {
      ...before.settings,
      labourRate: before.settings.labourRate + 80,
    },
  };
  const file = {
    name: "synthetic-conflicting-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(incoming)),
  };
  const upload = page.locator(
    'input[type="file"][accept=".json,application/json"]',
  );
  page.once("dialog", (dialog) => dialog.accept());
  await upload.setInputFiles(file);
  await expect(
    page
      .getByRole("alert")
      .filter({
        hasText: "Full restoration would replace or remove existing projects",
      }),
  ).toBeVisible();
  expect(await readWorkspace(page)).toEqual(before);

  const decisions = [false, true];
  const decide = (dialog: import("@playwright/test").Dialog) =>
    decisions.shift() ? dialog.accept() : dialog.dismiss();
  page.on("dialog", decide);
  await upload.setInputFiles(file);
  await expect(page.getByText(/Imported 1 quote/)).toBeVisible();
  page.off("dialog", decide);
  expect(decisions).toHaveLength(0);
  const after = await readWorkspace(page);
  expect(after.settings).toEqual(before.settings);
  expect(after.quotes.filter((quote) => quote.id !== extra.id)).toEqual(
    before.quotes,
  );
  expect(after.quotes.find((quote) => quote.id === extra.id)?.name).toBe(
    extra.name,
  );
});
