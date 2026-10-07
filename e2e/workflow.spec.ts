import { test, expect } from "@playwright/test";
test("mobile quote workflow, print privacy, job snapshot, persistence and completion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your work, at a glance." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/backwoods-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Taylor Test");
  await page.getByLabel("Job name *").fill("Test cedar deck");
  await page.getByLabel("Group detailed quote by scope").uncheck();
  await page
    .getByLabel("Project description / scope of work")
    .fill("Build a new cedar deck.");
  await page.getByLabel("Internal notes").fill("PRIVATE NOTES DO NOT PRINT");
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.getByLabel("Description *").fill("Cedar boards");
  await page.getByLabel("Required quantity", { exact: true }).fill("40");
  await page.getByLabel("Unit cost ($)", { exact: true }).fill("18");
  await page.getByLabel("Markup (%)", { exact: true }).fill("15");
  await expect(page.getByText("$828.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Labour", exact: true }).click();
  await page.getByRole("button", { name: "Add labour", exact: true }).click();
  await page.getByLabel("Description *").fill("Deck labour");
  await page.getByLabel("Estimated hours").fill("10");
  await page.getByLabel("Internal cost / hour ($)").fill("30");
  await page.getByLabel("Customer rate / hour ($)").fill("75");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  const doc = page.locator(".customer-document");
  await expect(doc).toContainText("$1,578.00");
  await expect(doc).toContainText("$205.14");
  await expect(doc).toContainText("$1,783.14");
  for (const word of [
    "PRIVATE NOTES",
    "Internal cost",
    "Markup",
    "Expected profit",
    "Contingency",
  ])
    await expect(doc).not.toContainText(word);
  await expect(doc).not.toContainText("Cedar boards");
  await page.getByLabel("Customer quote mode").selectOption("Detailed");
  await expect(doc).toContainText("Cedar boards");
  await expect(doc).not.toContainText("$720.00");
  await expect(doc).not.toContainText("$300.00");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".shell")).toBeHidden();
  await expect(page.locator(".preview-toolbar")).toBeHidden();
  await page.pdf({
    path: "/tmp/backwoods-quote.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm & mark sent" }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("Missing payment");
  await page.getByLabel("I reviewed these warnings").check();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Confirm & mark sent" }).click();
  await expect(page.getByLabel("Description *")).toBeDisabled();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Record acceptance" }).click();
  await expect(page.getByLabel("Description *")).toBeDisabled();
  await page.getByRole("button", { name: "Convert to job" }).click();
  await page.getByLabel("Description", { exact: true }).fill("Actual labour");
  await page.getByLabel("Actual hours", { exact: true }).fill("12");
  await page.getByLabel("Internal cost / hour ($)", { exact: true }).fill("30");
  await page.getByRole("button", { name: "Record actual cost" }).click();
  await expect(page.locator(".actual-list")).toContainText("$360.00");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("backwoods-quotes-v1")!),
  );
  const quote = stored.quotes.find(
    (q: { name: string }) => q.name === "Test cedar deck",
  );
  expect(quote.job.snapshot.lines[1].quantity).toBe(10);
  expect(quote.job.actuals[0].quantity).toBe(12);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Mark job completed" }).click();
  await expect(
    page.getByRole("button", { name: "Record actual cost" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /Test cedar deck/ }).click();
  await expect(page.locator(".actual-list")).toContainText("$360.00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "/tmp/backwoods-mobile-job.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("desktop dashboard and estimator access", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({ path: "/tmp/backwoods-desktop.png", fullPage: true });
  await page.getByLabel("Development role").selectOption("Estimator");
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Development role").selectOption("Admin/Owner");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Material markup (%)").fill("20");
  await page.getByRole("button", { name: "Save defaults" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Material markup (%)")).toHaveValue("20");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
test("invalid input and storage failures show actionable messages", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Customer name *").fill("Test");
  await page.getByLabel("Job name *").fill("Deck");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not save");
});
test("malformed saved records are preserved and reported rather than crashing", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "backwoods-quotes-v1",
      JSON.stringify({ version: 1, settings: {}, quotes: [{}] }),
    ),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Could not read saved data",
  );
  await expect(
    page.getByRole("heading", { name: "Your work, at a glance." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("backwoods-quotes-v1")!).quotes,
    ),
  ).toEqual([{}]);
});

test("owner can export a valid V2 data backup", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export data backup" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^backwoods-quotes-v2-.*\.json$/,
  );
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const data = JSON.parse(Buffer.concat(chunks).toString());
  expect(data.version).toBe(2);
  expect(data.quotes).toHaveLength(3);
  expect(data.quoteDefaults.showLabourHours).toBe(false);
});
