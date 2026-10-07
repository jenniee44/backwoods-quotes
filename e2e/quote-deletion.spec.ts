import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { seed, convert, storageKey, backupKey, jobTotals } from "../src/model";
import type { Store } from "../src/model";
import { addAnalysisSuggestions } from "../src/planAnalysis";
import { analysisFixture } from "../shared/analysis.fixture";
import { constructionPdf } from "./fixtures/constructionPdf";
async function setup(page: Page, store: Store) {
  await page.goto("/");
  await page.evaluate(
    ({ store, key, backup }) => {
      localStorage.setItem(key, JSON.stringify(store));
      localStorage.setItem(
        backup,
        JSON.stringify({
          version: 1,
          quotes: store.quotes,
          settings: store.settings,
        }),
      );
    },
    { store, key: storageKey, backup: backupKey },
  );
  await page.reload();
}
async function openDelete(page: Page, name: string) {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(
    page.getByRole("button", { name: "Delete quote", exact: true }),
  ).toBeVisible();
}
async function stored(page: Page): Promise<Store> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  );
}
test("mobile cancellation preserves bytes; confirmed deletion cleans plans/takeoff and keeps numbering across reload and duplication", async ({
  page,
}) => {
  const store = seed();
  const target = store.quotes[0];
  target.number = "BW-1040"; // Highest ever issued number.
  target.documents = [
    {
      id: "private-plan",
      name: "DELETE_PRIVATE_PLAN.pdf",
      type: "application/pdf",
      data:
        "data:application/pdf;base64," +
        Buffer.from(constructionPdf(), "ascii").toString("base64"),
      addedAt: "2026-10-07",
    },
  ];
  const enriched = addAnalysisSuggestions(
    target,
    analysisFixture("private-plan"),
    "PRIVATE_FINGERPRINT",
  );
  enriched.notes = "DELETE_PRIVATE_QUOTE_NOTES";
  enriched.photos = ["data:image/png;base64,aGVsbG8="];
  store.quotes[0] = enriched;
  await setup(page, store);
  await openDelete(page, enriched.name);
  const before = await page.evaluate(() => ({ ...localStorage }));
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain("BW-1040");
    expect(dialog.message()).toContain(enriched.name);
    expect(dialog.message()).toContain(enriched.customer.name);
    expect(dialog.message()).toContain("cannot be undone");
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Delete quote", exact: true }).click();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  await expect(
    page.getByRole("heading", { name: enriched.name, exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete quote", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your quotes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Quote BW-1040 deleted permanently.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(enriched.name) }),
  ).toHaveCount(0);
  const after = await stored(page);
  expect(after.quotes).toEqual(store.quotes.slice(1));
  expect(after.settings).toEqual(store.settings);
  expect(after.quoteDefaults).toEqual(store.quoteDefaults);
  expect(after.lastQuoteNumber).toBe(1040);
  const allStorage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage }),
  );
  for (const privateData of [
    "DELETE_PRIVATE_PLAN",
    "PRIVATE_FINGERPRINT",
    "DELETE_PRIVATE_QUOTE_NOTES",
    "PRIVATE_PLAN_TEXT_ONLY",
    target.documents[0].data,
  ])
    expect(allStorage).not.toContain(privateData);
  await page.waitForTimeout(800); // Pending autosave must not resurrect the quote.
  expect((await stored(page)).quotes).toEqual(after.quotes);
  await page.reload();
  await page
    .getByRole("button", { name: "Create New Quote", exact: true })
    .click();
  await expect(page.locator(".page-heading .eyebrow")).toContainText("BW-1041");
  await expect(
    page.getByRole("button", { name: "Delete quote", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await page
    .getByRole("button", { name: "Duplicate quote", exact: true })
    .click();
  await expect(page.locator(".page-heading .eyebrow")).toContainText("BW-1042");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("desktop deleting a converted quote keeps its separate job editable and reloadable without resurrecting the quote", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const store = seed();
  const index = store.quotes.findIndex((q) => q.status === "Accepted");
  const target = convert(store.quotes[index]);
  target.job!.actuals = [
    {
      id: "actual-1",
      description: "Existing job labour",
      category: "Labour",
      quantity: 8,
      cost: 35,
    },
  ];
  store.quotes[index] = target;
  await setup(page, store);
  await openDelete(page, target.name);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("will be preserved separately");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete quote", exact: true }).click();
  await expect(page.getByText(/Its job was preserved in Jobs/)).toBeVisible();
  let next = await stored(page);
  expect(next.quotes.some((q) => q.id === target.id)).toBe(false);
  expect(next.jobs).toHaveLength(1);
  expect(jobTotals(next.jobs![0])).toEqual(jobTotals(target));
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(target.name) }).click();
  await expect(page.locator(".actual-list")).toContainText(
    "Existing job labour",
  );
  await expect(
    page.getByRole("button", { name: "Delete quote", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Additional actual labour");
  await page.getByLabel("Actual hours", { exact: true }).fill("2");
  await page.getByLabel("Internal cost / hour ($)", { exact: true }).fill("40");
  await page
    .getByRole("button", { name: "Record actual cost", exact: true })
    .click();
  next = await stored(page);
  expect(next.jobs![0].job!.actuals).toHaveLength(2);
  expect(next.jobs![0].job!.snapshot).toEqual(target.job!.snapshot);
  expect(next.quotes.some((q) => q.id === target.id)).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(target.name) }).click();
  await expect(page.locator(".actual-list")).toContainText(
    "Additional actual labour",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Mark job completed", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Completed Jobs", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: new RegExp(target.name) }),
  ).toBeVisible();
  expect((await stored(page)).quotes.some((q) => q.id === target.id)).toBe(
    false,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("storage failure leaves the quote and editor intact and does not show deletion success", async ({
  page,
}) => {
  const store = seed();
  await setup(page, store);
  await openDelete(page, store.quotes[0].name);
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Unavailable", "QuotaExceededError");
    };
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete quote", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not delete the quote",
  );
  await expect(
    page.getByRole("heading", { name: store.quotes[0].name, exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  await expect(page.getByText(/deleted permanently/)).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`saved quote BW-1013 visibly exposes Delete quote without expanding a heading at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const store = seed();
    const target = store.quotes[0];
    target.number = "BW-1013";
    await setup(page, store);
    for (const status of ["Draft", "Sent", "Accepted", "Completed"] as const) {
      const currentStore = {
        ...store,
        quotes: store.quotes.map((q) =>
          q.id === target.id ? { ...q, status } : q,
        ),
      };
      await setup(page, currentStore);
      await page.getByRole("button", { name: new RegExp(target.name) }).click();
      const actions = page.getByRole("region", {
        name: "Quote actions",
        exact: true,
      });
      await expect(
        actions.getByRole("heading", { name: "Quote actions", exact: true }),
      ).toBeVisible();
      const button = actions.getByRole("button", {
        name: "Delete quote",
        exact: true,
      });
      await button.scrollIntoViewIfNeeded();
      await expect(button).toBeVisible();
      await expect(button).toBeInViewport();
      await expect(button).toBeEnabled();
      const before = await page.evaluate(() => ({ ...localStorage }));
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("BW-1013");
        expect(dialog.message()).toContain(target.name);
        expect(dialog.message()).toContain(target.customer.name);
        expect(dialog.message()).toContain("cannot be undone");
        await dialog.dismiss();
      });
      await button.click();
      expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
