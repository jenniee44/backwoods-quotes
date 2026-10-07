import { test, expect } from "@playwright/test";
import { analysisFixture } from "../shared/analysis.fixture";
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);
async function open(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Plan test");
  await page.getByLabel("Job name *").fill("Plan quote");
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.getByLabel("Description *").fill("Manual material");
  await page.getByLabel("Unit cost ($)", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "test-plan.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(
    page.getByRole("button", { name: "test-plan.png", exact: true }),
  ).toBeVisible();
}
test("AI proposal review, missing quantities, explicit approval, conversion, duplication and document privacy", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    calls++;
    const body = route.request().postDataJSON();
    await route.fulfill({ json: analysisFixture(body.documents[0].id) });
  });
  await open(page);
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("DO NOT SCALE DRAWINGS", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/backwoods-ai-takeoff.png",
    fullPage: true,
  });
  const cards = page.locator("fieldset.line-card");
  const labour = cards.nth(0);
  await labour.screenshot({ path: "/tmp/backwoods-ai-review-card.png" });
  const materials = cards.nth(1);
  await expect(labour.getByLabel("Takeoff quantity")).toHaveValue("");
  await expect(labour.getByText(/Requires contractor input —/)).toBeVisible();
  await expect(
    labour.getByRole("button", { name: "Approve item", exact: true }),
  ).toBeDisabled();
  await labour.getByLabel("Select for approval").check();
  await page
    .getByRole("button", { name: "Approve selected reviewed items" })
    .click();
  await expect(page.getByText(/Review this proposed item first/)).toBeVisible();
  await labour.getByLabel("Takeoff quantity").fill("3");
  await labour
    .getByRole("button", { name: "Mark reviewed — I verified this item" })
    .click();
  await labour
    .getByRole("button", { name: "Approve item", exact: true })
    .click();
  await labour
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Labour");
  await expect(
    labour.getByText("Converted to an estimate line.", { exact: false }),
  ).toBeVisible();
  await materials
    .getByRole("button", { name: "Mark reviewed — I verified this item" })
    .click();
  await page
    .getByRole("button", { name: "Approve all reviewed items" })
    .click();
  await materials
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Materials");
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already been analyzed" }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page
    .getByRole("button", { name: "View Estimate", exact: true })
    .click();
  await expect(page.getByLabel("Description *").nth(0)).toHaveValue(
    "Manual material",
  );
  await expect(page.getByLabel("Description *").nth(1)).toHaveValue("Joists");
  await expect(page.getByText(/Pricing required —/)).toBeVisible();
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  const doc = page.locator(".customer-document");
  for (const text of [
    "test-plan.png",
    "DO NOT SCALE",
    "VERIFY ON SITE",
    "confidence",
    "Joists",
    "hours",
    "Manual material",
  ])
    await expect(doc).not.toContainText(text);
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Plan quote/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await expect(
    page.getByText("DO NOT SCALE DRAWINGS", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/backwoods-ai-takeoff.png",
    fullPage: true,
  });
  await expect(
    page.getByText("Converted to an estimate line.", { exact: false }),
  ).toHaveCount(2);
});
test("invalid/API failure and cancellation preserve manual estimates; corrupt files are rejected", async ({
  page,
}) => {
  await open(page);
  await page.route("**/api/plan-analysis", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Provider unavailable; retry later." },
    }),
  );
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Provider unavailable" }),
  ).toBeVisible();
  await page.unroute("**/api/plan-analysis");
  await page.route("**/api/plan-analysis", (route) =>
    route.fulfill({
      json: { suggestions: [{ cost: 800, status: "Approved" }] },
    }),
  );
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "could not be validated" }),
  ).toBeVisible();
  await expect(page.getByLabel("Takeoff description")).toHaveCount(0);
  await page.unroute("**/api/plan-analysis");
  await page.route("**/api/plan-analysis", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.abort().catch(() => {});
  });
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel analysis" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "cancelled" }),
  ).toBeVisible();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "bad.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 corrupted"),
  });
  await expect(
    page.getByText(/corrupted|valid PDF|damaged/i).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(page.getByLabel("Description *")).toHaveValue("Manual material");
  await expect(page.getByLabel("Unit cost ($)", { exact: true })).toHaveValue(
    "50",
  );
});
