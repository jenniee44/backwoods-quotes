import { test, expect } from "@playwright/test";
test("mobile quote inheritance, scope reuse, grouped pricing, autosave and sent confirmation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  for (const [label, value] of [
    ["Internal labour cost ($/hour)", "35"],
    ["Customer labour rate ($/hour)", "90"],
    ["Material markup (%)", "20"],
    ["Other Costs / subcontractor markup (%)", "15"],
    ["Overhead / profit addition (%)", "10"],
    ["Contingency (%)", "5"],
    ["Default quote validity (days)", "30"],
  ]) {
    const field = page.getByLabel(label, { exact: true });
    await expect(field).toHaveAttribute("step", "1");
    await field.fill(value);
  }
  await page.getByRole("button", { name: "Save defaults" }).click();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Preview customer");
  await page.getByLabel("Job name *").fill("Grouped renovation");
  await page
    .getByLabel("Project description / scope of work")
    .fill("Frame basement walls.");
  await expect(page.getByLabel("Show customer quantities")).not.toBeChecked();
  await expect(
    page.getByLabel("Show estimated labour hours"),
  ).not.toBeChecked();
  await expect(page.getByLabel("Group detailed quote by scope")).toBeChecked();
  await expect(page.getByLabel("Expiry date (optional)")).not.toHaveValue("");
  await page.getByRole("button", { name: "Labour", exact: true }).click();
  await page.getByRole("button", { name: "Add labour", exact: true }).click();
  await page.getByLabel("Description *").fill("Internal framing labour");
  await page.getByLabel("Customer scope group (optional)").fill("Framing");
  await expect(
    page.getByRole("option", { name: "Decking", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Estimated hours").click();
  await expect(page.getByLabel("Internal cost / hour ($)")).toHaveValue("35");
  await expect(page.getByLabel("Customer rate / hour ($)")).toHaveValue("90");
  await page.getByLabel("Customer rate / hour ($)").fill("70");
  await expect(
    page.getByLabel("Use quote customer labour rate"),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.getByLabel("Description *").fill("Internal lumber");
  const group = page.getByLabel("Customer scope group (optional)");
  await group.click();
  await expect(
    page.getByRole("option", { name: "Framing", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "Framing", exact: true }).click();
  await page.getByLabel("Unit", { exact: true }).click();
  await page.getByRole("option", { name: "board", exact: true }).click();
  await expect(page.getByLabel("Unit", { exact: true })).toHaveValue("board");
  await page.getByLabel("Unit cost ($)", { exact: true }).fill("100");
  await expect(page.getByLabel("Markup (%)", { exact: true })).toHaveValue(
    "20",
  );
  await page.getByLabel("Markup (%)", { exact: true }).fill("10");
  await expect(page.getByLabel("Use quote markup")).not.toBeChecked();
  await page.getByText("Internal material details", { exact: true }).click();
  await page.getByLabel("Supplier (private)").fill("SECRET SUPPLIER");
  await page.getByLabel("SKU / product number (private)").fill("SECRET SKU");
  await page.getByLabel("Material notes (private)").fill("SECRET NOTES");
  await page
    .getByRole("button", { name: "Subcontractors & Other Costs", exact: true })
    .click();
  await page.getByRole("button", { name: "Add cost", exact: true }).click();
  await page.getByLabel("Description *").fill("Internal subcontractor");
  await expect(page.getByLabel("Category")).toHaveValue("Subcontractor");
  await expect(page.getByLabel("Unit", { exact: true })).toHaveValue(
    "allowance",
  );
  await page.getByLabel("Customer scope group (optional)").fill("Framing");
  await page.getByLabel("Unit cost ($)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  await page.getByLabel("Customer labour rate ($/hour)").fill("110");
  await expect(page.getByLabel("Internal labour cost ($/hour)")).toBeHidden();
  await page.getByText("Advanced pricing", { exact: true }).click();
  await expect(page.getByLabel("Internal labour cost ($/hour)")).toBeVisible();
  await page.getByLabel("HST (%)").focus();
  await expect(page.locator(".save-indicator")).toContainText("Saved");
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("backwoods-quotes-v1")!),
  );
  const q = persisted.quotes.find(
    (q: { name: string }) => q.name === "Grouped renovation",
  );
  expect(q.lines[0].inheritRate).toBe(false);
  expect(q.lines[1].inheritMarkup).toBe(false);
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  await page.getByLabel("Customer quote mode").selectOption("Detailed");
  const doc = page.locator(".customer-document");
  await expect(doc.locator("tbody tr")).toHaveCount(1);
  await expect(doc).toContainText("$339.25");
  await expect(doc).not.toContainText("Internal lumber");
  await expect(doc).not.toContainText("coordination");
  await expect(doc).not.toContainText("allowances");
  await expect(doc).not.toContainText("SECRET");
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByLabel("I reviewed these warnings").check();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Confirm & mark sent" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirm & mark sent" }).click();
  await expect(page.getByLabel("Customer labour rate ($/hour)")).toBeDisabled();
  const sent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("backwoods-quotes-v1")!).quotes.find(
      (q: { name: string }) => q.name === "Grouped renovation",
    ),
  );
  expect(sent.status).toBe("Sent");
  expect(sent.sentAt).toMatch(/^\d{4}-/);
  expect(sent.snapshot).toBeDefined();
  await page.locator(".summary").scrollIntoViewIfNeeded();
  const tabs = await page.locator(".tabs").boundingBox();
  expect(tabs!.y).toBeGreaterThanOrEqual(0);
  expect(tabs!.y).toBeLessThan(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "/tmp/backwoods-refined-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("blank numeric edits commit on blur/save, whole steps, leading zeros and save failure", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Job name *").fill("Blank numeric test");
  await page.getByRole("button", { name: "Labour", exact: true }).click();
  await page.getByRole("button", { name: "Add labour", exact: true }).click();
  await page.getByLabel("Description *").fill("Labour");
  const cost = page.getByLabel("Internal cost / hour ($)");
  await expect(cost).toHaveAttribute("step", "1");
  await cost.click();
  await cost.pressSequentially("012");
  await expect(cost).toHaveValue("12");
  await cost.blur();
  await expect(page.locator(".save-indicator")).toContainText("Saved");
  await cost.fill("");
  await expect(cost).toHaveValue("");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(cost).toHaveValue("0");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("backwoods-quotes-v1")!).quotes.find(
      (q: { name: string }) => q.name === "Blank numeric test",
    ),
  );
  expect(stored.lines[0].cost).toBe(0);
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  const markup = page.getByLabel("Material markup (%)");
  await expect(markup).toHaveAttribute("step", "1");
  await markup.fill("10");
  await markup.press("ArrowUp");
  await expect(markup).toHaveValue("11");
  await markup.press("ArrowDown");
  await expect(markup).toHaveValue("10");
  await page.getByText("Advanced pricing", { exact: true }).click();
  await expect(
    page.getByLabel("Default quote validity (days)"),
  ).toHaveAttribute("step", "1");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await markup.fill("25");
  await markup.blur();
  await expect(page.locator(".save-indicator")).toContainText("Save failed");
  await expect(page.getByRole("alert")).toContainText("Could not save");
});
