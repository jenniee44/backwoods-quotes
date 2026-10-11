import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
import { analysisFixture } from "../shared/analysis.fixture";
async function setup(page: import("@playwright/test").Page) {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic summary test";
  const t: TakeoffItem = {
    id: "flash",
    description: "Aluminum ledger flashing",
    specification: "Aluminum Z flashing",
    quantity: 20,
    unit: "ft",
    documentId: "synthetic",
    page: 1,
    notes: "New work",
    status: "Proposed",
    origin: "ai",
    confidence: "High",
    destination: "Materials",
    category: "Miscellaneous",
    workScope: "New work",
    included: true,
    location: "Rear ledger",
  };
  q.takeoff = [
    t,
    {
      ...t,
      id: "duplicate",
      page: 2,
      sourceFacts: ["Synthetic second drawing reference"],
    },
    {
      ...t,
      id: "unknown",
      description: "Deck joists",
      category: "Joists",
      specification: "2x6 PT",
      quantity: null,
      unit: "boards",
      location: "Rear framing",
    },
  ];
  await page.goto("/");
  await page.evaluate(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.reload();
  await page.getByRole("button", { name: /Synthetic summary test/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  return q.lines;
}
async function saved(page: import("@playwright/test").Page) {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).quotes.find(
        (q: { name: string }) => q.name === "Synthetic summary test",
      ),
    storageKey,
  );
}
test("default consolidated table edits inline, gates bulk approval and sends final shopping list without replacing manual lines", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const lines = await setup(page);
  const summary = page.getByRole("region", { name: "Materials Summary" });
  await expect(summary).toBeVisible();
  await expect(page.locator(".advanced-review")).not.toHaveAttribute("open");
  await expect(summary.locator("tbody tr")).toHaveCount(2);
  await summary.screenshot({
    path: "/tmp/backwoods-materials-summary-desktop.png",
  });
  await expect(page.getByLabel("Quantity: flash", { exact: true })).toHaveValue(
    "20",
  );
  await expect(
    page.getByLabel("Quantity: unknown", { exact: true }),
  ).toHaveAttribute("placeholder", "Quantity needed");
  await summary
    .getByText("Needs Attention — 1 material", { exact: true })
    .click();
  await expect(
    summary.getByRole("link", { name: "Deck joists" }),
  ).toBeVisible();
  await page
    .getByLabel("Specifications: flash", { exact: true })
    .fill("Contractor-selected aluminum Z flashing");
  await page.getByLabel("Quantity: flash", { exact: true }).fill("24");
  await summary
    .getByRole("heading", { name: "Materials Summary", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).takeoff.find((t: TakeoffItem) => t.id === "flash")
          .quantity,
    )
    .toBe(24);
  await expect
    .poll(
      async () =>
        (await saved(page)).takeoff.find((t: TakeoffItem) => t.id === "flash")
          .specification,
    )
    .toBe("Contractor-selected aluminum Z flashing");
  await page.getByLabel("Include: flash", { exact: true }).selectOption("No");
  await expect(page.locator("#summary-flash")).toContainText("Excluded");
  await page.getByLabel("Include: flash", { exact: true }).selectOption("Yes");
  await summary
    .getByRole("button", { name: /Select eligible materials/ })
    .click();
  const approve = summary.getByRole("button", {
    name: /Approve selected materials/,
  });
  await expect(approve).toBeDisabled();
  await summary
    .getByLabel(
      "I verified the selected specifications, purchase quantities, scope and drawing evidence.",
    )
    .check();
  await approve.click();
  await expect(page.locator("#summary-flash")).toContainText("Approved");
  await summary.getByRole("button", { name: /Final Shopping List/ }).click();
  await expect(summary.locator("tbody tr")).toHaveCount(1);
  await summary
    .getByRole("button", { name: "Send approved materials to estimate" })
    .click();
  await expect(page.locator("#summary-flash")).toContainText(
    "Added to estimate",
  );
  await expect
    .poll(async () => (await saved(page)).lines.length)
    .toBe(lines.length + 1);
  const after = await saved(page);
  expect(after.lines.slice(0, lines.length)).toEqual(lines);
  expect(after.lines.at(-1)).toMatchObject({
    takeoffId: "flash",
    quantity: 24,
    cost: 0,
  });
  await expect(
    summary.getByRole("button", {
      name: "Send approved materials to estimate",
    }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(summary).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await summary.screenshot({
    path: "/tmp/backwoods-materials-summary-mobile.png",
  });
});
test("editing an approved item resets approval; invalid input reverts and Advanced Review remains available", async ({
  page,
}) => {
  await setup(page);
  const s = page.getByRole("region", { name: "Materials Summary" });
  await s.getByRole("button", { name: /Select eligible materials/ }).click();
  await s
    .getByLabel(
      "I verified the selected specifications, purchase quantities, scope and drawing evidence.",
    )
    .check();
  await s.getByRole("button", { name: /Approve selected materials/ }).click();
  await page.getByLabel("Quantity: flash", { exact: true }).fill("-1");
  await s
    .getByRole("heading", { name: "Materials Summary", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("non-negative");
  await expect(page.getByLabel("Quantity: flash", { exact: true })).toHaveValue(
    "20",
  );
  await page.getByLabel("Quantity: flash", { exact: true }).fill("22");
  await s
    .getByRole("heading", { name: "Materials Summary", exact: true })
    .click();
  await expect(page.locator("#summary-flash")).toContainText(
    "Ready for review",
  );
  await page.locator(".advanced-review > summary").click();
  await expect(
    page
      .locator("#takeoff-flash")
      .getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
});
test("successful new analysis immediately returns to Materials Summary instead of detailed cards", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.route("**/api/plan-analysis", (route) =>
    route.fulfill({
      json: analysisFixture(route.request().postDataJSON().documents[0].id),
    }),
  );
  await page.locator(".advanced-review > summary").click();
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".advanced-review")).not.toHaveAttribute("open");
  await expect(
    page.getByRole("button", { name: "Materials Summary", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "Materials Summary" }).locator("tbody tr"),
  ).not.toHaveCount(0);
});
