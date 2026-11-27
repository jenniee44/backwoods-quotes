import { expect, test } from "@playwright/test";
import { readWorkspace } from "./fixtures/readWorkspace";
import { selectEditorTab } from "./fixtures/selectEditorTab";

test("owner catalogue and draft crew costing persist without repricing other quotes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const before = await readWorkspace(page);
  await page.getByText("Material price catalogue", { exact: true }).click();
  await page
    .getByLabel("Material name", { exact: true })
    .fill("Synthetic stock");
  await page.getByLabel("Catalogue unit", { exact: true }).fill("each");
  await page.getByLabel("Catalogue unit cost ($)").fill("22");
  await page.getByLabel("Stock length (ft, optional)").fill("12");
  await page.getByRole("button", { name: "Save catalogue entry" }).click();
  await expect(
    page.getByText("Material catalogue saved.", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Synthetic customer");
  await page.getByLabel("Job name *").fill("Synthetic costing");
  await selectEditorTab(page, "Materials");
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.getByLabel("Description *").fill("Boards");
  await page
    .getByLabel("Copy saved material price")
    .selectOption({ label: "Synthetic stock · $22.00 / each · 12 ft stock" });
  await expect(page.getByLabel("Unit cost ($)", { exact: true })).toHaveValue(
    "22",
  );

  await selectEditorTab(page, "Labour");
  await page.getByRole("button", { name: "Add labour", exact: true }).click();
  await page.getByLabel("Description *").fill("Framing");
  await page
    .getByText("Estimate labour from task productivity", { exact: true })
    .click();
  for (const [label, value] of [
    ["Task quantity", "24"],
    ["Units per crew-hour at full efficiency", "6"],
    ["Crew members", "2"],
    ["Crew efficiency (%)", "80"],
    ["Wage per worker-hour ($)", "40"],
    ["Employee burden (%)", "25"],
    ["Equipment per crew-hour ($)", "15"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole("button", { name: "Use labour hours and cost" }).click();
  await page
    .getByRole("button", { name: "Add separate equipment line" })
    .click();
  await expect(page.getByLabel("Estimated hours", { exact: true })).toHaveValue(
    "10",
  );
  await expect(
    page.getByLabel("Internal cost / hour ($)", { exact: true }),
  ).toHaveValue("50");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.locator(".notice")).toHaveText("Saved on this device");

  const saved = await readWorkspace(page);
  const quote = saved.quotes.find(
    (record) => record.name === "Synthetic costing",
  );
  expect(quote?.lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "Materials",
        cost: 22,
        catalogueStockLengthFt: 12,
      }),
      expect.objectContaining({
        kind: "Labour",
        quantity: 10,
        cost: 50,
        inheritCost: false,
      }),
      expect.objectContaining({
        kind: "Other Costs",
        category: "Equipment Rental",
        quantity: 5,
        cost: 15,
      }),
    ]),
  );
  expect(saved.quotes.filter((record) => record.id !== quote?.id)).toEqual(
    before.quotes,
  );
});
