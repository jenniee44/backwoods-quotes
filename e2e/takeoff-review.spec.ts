import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
async function setup(page: import("@playwright/test").Page) {
  const store = seed();
  const q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic overlap review";
  const item = (
    id: string,
    description: string,
    category: string,
  ): TakeoffItem => ({
    id,
    description,
    category,
    specification:
      category === "Beams" ? "3-ply 2x10 PT" : "Verified wood guard",
    location: "Rear deck",
    quantity: category === "Beams" ? 2 : null,
    unit: "each",
    documentId: "",
    page: null,
    notes: "Synthetic reference " + id,
    sourceFacts: ["Synthetic drawing callout " + id],
    confidence: "High",
    status: "Proposed",
    origin: "ai",
    destination: "Materials",
  });
  q.takeoff = [
    item("b1", "3-ply 2x10 beam", "Beams"),
    item("b2", "Built-up 3-ply 2x10 beam", "Beams"),
    item("g1", "Deck guard", "Guards / railings"),
    item("g2", "Wood deck railing", "Guards / railings"),
    {
      ...item("g3", "Guard work by others", "Guards / railings"),
      workScope: "By others",
      location: "Front deck",
    },
  ];
  await page.goto("/");
  await page.evaluate(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.reload();
  await page.getByRole("button", { name: /Synthetic overlap review/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
}
test("laptop summaries stay compact; missing inputs start collapsed; beam/guard comparisons are explicit and safe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await setup(page);
  const checklist = page.locator(".missing-information");
  await expect(checklist).not.toHaveAttribute("open", "");
  await expect(checklist.locator("summary")).toContainText("3 items");
  const rows = page.locator(".takeoff-table > tbody.line-card");
  await expect(rows).toHaveCount(5);
  await expect(page.locator(".overlap-warning")).toHaveCount(5);
  await expect(
    rows.first().getByLabel("Written specification"),
  ).not.toBeVisible();
  await rows.first().locator("summary").click();
  await expect(rows.first().getByLabel("Written specification")).toHaveValue(
    "3-ply 2x10 PT",
  );
  await expect(
    rows.first().getByRole("button", { name: "Approve item", exact: true }),
  ).toBeDisabled();
  for (const control of [
    "Written specification",
    "Takeoff quantity",
    "Convert reviewed item to estimate",
  ]) {
    const rect = await rows.first().getByLabel(control).boundingBox();
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(1366);
  }
  expect(
    await page
      .locator(".takeoff-table-scroll")
      .first()
      .evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  page.once("dialog", (d) => d.dismiss());
  await rows
    .first()
    .getByRole("button", { name: "Consolidate matching material" })
    .click();
  await expect(rows.nth(1).getByLabel("Review status")).toHaveValue("Proposed");
  page.once("dialog", (d) => d.accept());
  await rows
    .first()
    .getByRole("button", { name: "Consolidate matching material" })
    .click();
  await expect(rows.nth(1).getByLabel("Review status")).toHaveValue("Rejected");
  await expect(rows.first().getByLabel("Takeoff quantity")).toHaveValue("2");
  await expect(rows.first()).toContainText("Synthetic reference b2");
  await rows.nth(2).locator("summary").click();
  await expect(rows.nth(2).locator(".overlap-comparison")).toContainText(
    "Front deck",
  );
  await expect(rows.nth(2).locator(".overlap-comparison")).toContainText(
    "By others",
  );
  page.once("dialog", (d) => d.accept());
  await rows
    .nth(2)
    .getByRole("button", { name: "Consolidate matching material" })
    .nth(1)
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Keep distinct assemblies separate",
  );
  page.once("dialog", (d) => d.accept());
  await rows
    .nth(2)
    .getByRole("button", { name: "Confirm separate items" })
    .nth(1)
    .click();
  await expect(rows).toHaveCount(5);
  await checklist.locator("summary").click();
  await expect(checklist.getByRole("button").first()).toBeVisible();
  await page.screenshot({
    path: "/tmp/backwoods-takeoff-review-laptop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
