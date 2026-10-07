import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
test("bathroom allowance, public scopes, payment validation and letter print privacy", async ({
  page,
}) => {
  const store = seed();
  store.settings = {
    ...store.settings,
    labourRate: 90,
    internalLabourCost: 35,
    materialMarkup: 20,
    otherMarkup: 10,
    targetMargin: 25,
  };
  store.quoteDefaults.payment =
    "20% acceptance, 30% start, 30% midpoint, 20% completion";
  store.company = {
    name: "Backwoods Building & Maintenance",
    phone: "705-555-0123",
    email: "office@example.test",
    address: "Ontario",
  };
  await page.addInitScript(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Test homeowner");
  await page
    .getByLabel("Customer mailing address (optional)")
    .fill("10 Customer Road");
  await page.getByLabel("Job name *").fill("Bathroom refresh");
  await page.getByLabel("Job address", { exact: true }).fill("25 Project Road");
  await page
    .getByLabel("Project description / scope of work")
    .fill("Bathroom work as agreed.");
  await page.getByLabel("Internal notes").fill("PRIVATE JOB NOTES");
  await page
    .getByLabel("Assumptions", { exact: true })
    .fill("Leave blank as a company default. These are usually job-specific.");
  await page.getByLabel("Apply construction template").selectOption("bathroom");
  await page.getByRole("button", { name: "Apply selected template" }).click();
  const drywall = page.locator(".line-card").filter({
    has: page.locator('input[value="Drywall / board installation labour"]'),
  });
  await drywall.getByLabel("Estimated hours").fill("2");
  await page
    .getByRole("button", { name: "Subcontractors & Other Costs", exact: true })
    .click();
  const plumbing = page.locator(".line-card").filter({
    has: page.locator('input[value="Plumbing subcontractor allowance"]'),
  });
  await expect(plumbing.getByLabel("Entry method")).toHaveValue("allowance");
  await expect(plumbing.getByLabel("Quantity", { exact: true })).toHaveCount(0);
  await plumbing.getByLabel("Estimated cost ($)").fill("800");
  await expect(plumbing.locator(".line-footer")).toContainText("$880.00");
  await plumbing.getByLabel("Selling price override ($)").fill("900");
  await expect(plumbing.locator(".line-footer")).toContainText("$900.00");
  await plumbing.getByLabel("Selling price override ($)").fill("");
  await plumbing.getByLabel("Selling price override ($)").blur();
  await plumbing.getByLabel("Entry method").selectOption("quantity");
  await expect(plumbing.getByLabel("Quantity", { exact: true })).toHaveValue(
    "1",
  );
  await expect(plumbing.locator(".line-footer")).toContainText("$880.00");
  await plumbing.getByLabel("Entry method").selectOption("allowance");
  await page
    .getByRole("button", { name: "Customer & job", exact: true })
    .click();
  await page.getByText("Customer scope sections", { exact: true }).click();
  const section = page
    .locator(".scope-editor .line-card")
    .filter({ hasText: "Groups included: Framing & Blocking" });
  await section
    .getByLabel("Customer section heading")
    .fill("Walls & Preparation");
  await section
    .getByLabel("Included work description")
    .fill("Install the agreed wall board and prepare wall surfaces.");
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.locator(".save-indicator")).toContainText("Saved");
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  await expect(
    page.getByLabel("Customer quote mode").locator("option"),
  ).toHaveText(["Summary", "Detailed"]);
  await page.getByLabel("Customer quote mode").selectOption("Detailed");
  const doc = page.locator(".customer-document");
  await expect(doc).toContainText("Walls & Preparation");
  await expect(doc).toContainText("Install the agreed wall board");
  await expect(doc).toContainText("Mechanical Trades");
  await expect(doc).toContainText("$1,060.00");
  await expect(doc).toContainText("$137.80");
  await expect(doc).toContainText("$1,197.80");
  await expect(doc).toContainText("25 Project Road");
  await expect(doc).toContainText("10 Customer Road");
  await expect(doc).toContainText("705-555-0123");
  for (const privateText of [
    "PRIVATE",
    "Leave blank",
    "Drywall / board installation labour",
    "Plumbing subcontractor allowance",
    "$800.00",
    "gross margin",
    "hour",
    "$0.00",
  ])
    await expect(doc).not.toContainText(privateText);
  await expect(doc.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Customer quote mode").selectOption("Simplified");
  await expect(doc.locator("tbody tr")).toHaveCount(1);
  await expect(doc).not.toContainText("Mechanical Trades");
  await page.getByLabel("Customer quote mode").selectOption("Detailed");
  await page.screenshot({
    path: "/tmp/backwoods-readiness-mobile.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".shell")).toBeHidden();
  await expect(page.locator(".preview-toolbar")).toBeHidden();
  await expect(page.locator(".preview-options").first()).toBeHidden();
  await page.pdf({
    path: "/tmp/backwoods-readiness-letter.pdf",
    format: "Letter",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Back to editor" }).click();
  await page
    .getByLabel("Payment / deposit schedule")
    .fill("20% deposit, 70% completion");
  await expect(
    page.getByRole("alert").filter({ hasText: "100%" }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await expect(page.locator(".save-indicator")).toContainText("Save failed");
});

test("customer document and editor fit phone, tablet and desktop; long letter quotes paginate", async ({
  page,
}) => {
  const store = seed();
  const quote = store.quotes[0];
  quote.name = "Long public scope";
  quote.terms = Array.from(
    { length: 120 },
    (_, i) => `Public condition ${i + 1}: review the agreed project scope.`,
  ).join("\n");
  quote.lines.forEach((line) => {
    line.materialNotes = "PRIVATE MATERIAL NOTE";
  });
  await page.addInitScript(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.goto("/");
  await page.getByRole("button", { name: /Long public scope/ }).click();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const doc = page.locator(".customer-document");
    expect(await doc.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
  }
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({
    path: "/tmp/backwoods-readiness-long.pdf",
    format: "Letter",
    printBackground: true,
  });
  expect(
    (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
  ).toBeGreaterThan(1);
  await expect(page.locator(".customer-document")).not.toContainText(
    "PRIVATE MATERIAL NOTE",
  );
});
