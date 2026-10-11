import { openAdvancedMaterial } from "./material-review.helpers";
import { test, expect, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Synthetic materials test");
  await page.getByLabel("Job name *").fill("Verified takeoff workflow");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
}
test("compact table calculates only from verified inputs, resets review on edits, converts once and keeps customer output private", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Add takeoff item", exact: true })
    .click();
  const row = page.locator(".takeoff-table tbody.line-card").first();
  await openAdvancedMaterial(row);
  await row.getByLabel("Takeoff description").fill("Deck joists");
  await row.getByLabel("Written specification").fill("2x8 PT, verified layout");
  await row.getByLabel("Suggested destination").selectOption("Materials");
  await row.getByLabel("Takeoff category").selectOption("Joists");
  await row.getByLabel("Material calculator").selectOption("joists");
  await expect(
    page.getByRole("navigation", { name: "Material review summary" }),
  ).toBeVisible();
  await expect(row.getByLabel("Takeoff quantity")).toHaveValue("");
  await row
    .getByLabel("Verified layout length (ft)", { exact: true })
    .fill("20");
  await row
    .getByLabel("Verified joist spacing (in)", { exact: true })
    .fill("16");
  await row
    .getByLabel("Required continuous joist length (ft)", { exact: true })
    .fill("12");
  await row
    .getByLabel("Selected stock length (ft)", { exact: true })
    .fill("12");
  await row.getByLabel("Waste allowance (%)", { exact: true }).fill("10");
  await expect(row).toContainText("Calculated preview: 18 boards");
  await expect(row.getByLabel("Takeoff quantity")).toHaveValue("");
  await row.getByLabel("I verified all calculator inputs").check();
  await expect(row.getByLabel("Takeoff quantity")).toHaveValue("18");
  await row
    .getByRole("button", {
      name: "Mark reviewed — I verified this item",
      exact: true,
    })
    .click();
  await row.getByRole("button", { name: "Approve item", exact: true }).click();
  await expect(
    row.getByLabel("Convert reviewed item to estimate"),
  ).toBeEnabled();
  await row
    .getByLabel("Verified joist spacing (in)", { exact: true })
    .fill("12");
  await expect(row.getByLabel("Review status")).toHaveValue("Proposed");
  await expect(row.getByLabel("Takeoff quantity")).toHaveValue("");
  await expect(
    row.getByLabel("Convert reviewed item to estimate"),
  ).toBeDisabled();
  await row.getByLabel("I verified all calculator inputs").check();
  await expect(row.getByLabel("Takeoff quantity")).toHaveValue("24");
  await row
    .getByRole("button", {
      name: "Mark reviewed — I verified this item",
      exact: true,
    })
    .click();
  await row.getByRole("button", { name: "Approve item", exact: true }).click();
  await row
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Materials");
  await expect(row).toContainText("Converted to an estimate line");
  await expect(row.getByLabel("Takeoff quantity")).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const panelWidth = await page
    .locator(".takeoff-table-scroll")
    .evaluate((node) => node.clientWidth);
  expect(
    (await row.locator(".takeoff-evidence").boundingBox())!.width,
  ).toBeLessThanOrEqual(panelWidth);
  await row
    .getByText("View details", {
      exact: true,
    })
    .click();
  expect(
    (await row.locator(":scope > tr").first().boundingBox())!.height,
  ).toBeLessThan(260);
  await page.screenshot({
    path: "/tmp/backwoods-calculator-table-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Verified takeoff workflow/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await expect(page.locator(".takeoff-table")).toContainText(
    "Converted to an estimate line",
  );
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  await expect(page.locator(".customer-document")).not.toContainText(
    /Calculated preview|stock=|scopeVerified|calculator|Missing information|alternativeGroup/,
  );
});
test("by-others inclusion is explicit and mutually exclusive foundations cannot both be approved", async ({
  page,
}) => {
  await open(page);
  for (const [description, method] of [
    ["Concrete footing", "Concrete"],
    ["Helical pile", "Helical"],
  ]) {
    await page
      .getByRole("button", { name: "Add takeoff item", exact: true })
      .click();
    await openAdvancedMaterial(
      page.locator(".takeoff-table tbody.line-card").last(),
    );
    await page
      .locator(".takeoff-table tbody.line-card")
      .last()
      .getByLabel("Takeoff description")
      .fill(description);
    const row = page
      .locator(".takeoff-table tbody.line-card")
      .filter({ has: page.locator(`input[value="${description}"]`) });
    await row.getByLabel("Takeoff quantity").fill("6");
    await row
      .getByLabel("Written specification")
      .fill("Contractor verified foundation design");

    await row.getByLabel("Alternative assembly group").fill("Rear foundation");
    await row.getByLabel("Alternative construction method").fill(method);
    if (method === "Helical") {
      await expect(row.getByLabel("Work scope")).toBeVisible();
      await row.getByLabel("Work scope").selectOption("By others / excluded");
      await row
        .getByRole("button", {
          name: "Mark reviewed — I verified this item",
          exact: true,
        })
        .click();
      await expect(page.getByRole("alert")).toContainText("Explicitly include");
      await row
        .getByLabel("Explicitly include this work in our contract")
        .check();
    }
    await row
      .getByRole("button", {
        name: "Mark reviewed — I verified this item",
        exact: true,
      })
      .click();
    await row
      .getByRole("button", { name: "Approve item", exact: true })
      .click();
  }
  await expect(page.getByRole("alert")).toContainText("Mutually exclusive");
  const rows = page.locator(".takeoff-table tbody.line-card");
  await expect(rows.first().getByLabel("Review status")).toHaveValue(
    "Approved",
  );
  await expect(rows.last().getByLabel("Review status")).toHaveValue("Reviewed");
  await rows
    .first()
    .getByRole("button", { name: "Reject item", exact: true })
    .click();
  await rows
    .last()
    .getByRole("button", { name: "Approve item", exact: true })
    .click();
  await expect(rows.last().getByLabel("Review status")).toHaveValue("Approved");
  for (const summary of await page
    .getByText("View details", {
      exact: true,
    })
    .all())
    await summary.click();
  await page.setViewportSize({ width: 1440, height: 960 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/backwoods-takeoff-table-desktop.png",
    fullPage: true,
  });
});

test("directional decking purchase layout recalculates, remains unverified and converts only after review", async ({
  page,
}) => {
  await open(page);
  await page
    .getByRole("button", { name: "Add takeoff item", exact: true })
    .click();
  const row = page.locator(".takeoff-table tbody.line-card").first();
  await openAdvancedMaterial(row);
  await row.getByLabel("Takeoff description").fill("Deck board purchase");
  await row
    .getByLabel("Written specification")
    .fill("Verified actual width 5.5 in PT decking");
  await row.getByLabel("Suggested destination").selectOption("Materials");
  await row.getByLabel("Source facts").fill("Deck length 20 ft; width 12 ft");
  await row.getByLabel("Material calculator").selectOption("decking-layout");
  await row
    .getByLabel("Use written measurement for Verified layout length (ft)", {
      exact: true,
    })
    .selectOption("1");
  await expect(
    row.getByLabel("Verified layout length (ft)", { exact: true }),
  ).toHaveValue("20");
  await expect(
    row.getByLabel("I verified all calculator inputs"),
  ).not.toBeChecked();
  const fields: [string, string][] = [
    ["Verified layout length (ft)", "20"],
    ["Verified width (ft)", "12"],
    ["Actual board width (in)", "5.5"],
    ["Selected board gap (in)", "0.125"],
    ["Selected stock length (ft)", "10"],
    ["Saw kerf / cutting loss (in)", "0.125"],
    ["Contractor-approved pieces per row", "2"],
    ["Waste allowance (%)", "10"],
  ];
  for (const [name, value] of fields)
    await row.getByLabel(name, { exact: true }).fill(value);
  await row
    .getByLabel("Installation direction", { exact: true })
    .selectOption("0");
  await expect(row).toContainText("Calculated preview: 58 boards");
  await expect(row.getByLabel("Takeoff quantity")).toHaveValue("");
  await expect(
    row.getByLabel("Convert reviewed item to estimate"),
  ).toBeDisabled();
  await row.getByLabel("I verified all calculator inputs").check();
  await expect(row.getByLabel("Takeoff quantity")).toHaveValue("58");
  await row
    .getByLabel("Installation direction", { exact: true })
    .selectOption("1");
  await expect(row.getByLabel("Takeoff quantity")).toHaveValue("");
  await expect(
    row.getByLabel("I verified all calculator inputs"),
  ).not.toBeChecked();
  await row
    .getByLabel("Selected stock length (ft)", { exact: true })
    .fill("12");
  await row
    .getByLabel("Contractor-approved pieces per row", { exact: true })
    .fill("1");
  await row.getByLabel("Waste allowance (%)", { exact: true }).fill("0");
  await expect(row).toContainText("Calculated preview: 43 boards");
  await row.getByLabel("I verified all calculator inputs").check();
  await row
    .getByRole("button", {
      name: "Mark reviewed — I verified this item",
      exact: true,
    })
    .click();
  await row.getByRole("button", { name: "Approve item", exact: true }).click();
  await row
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Materials");
  await expect(row).toContainText("Converted to an estimate line");
  await expect(row.getByLabel("Takeoff quantity")).toBeDisabled();
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  await expect(page.locator(".customer-document")).not.toContainText(
    "Saw kerf",
  );
  await expect(page.locator(".customer-document")).not.toContainText(
    "sourceFacts",
  );
});
