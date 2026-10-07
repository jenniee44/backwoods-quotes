import { test, expect } from "@playwright/test";
import { seed, calculate, estimateFor } from "../src/model";

test("natural numeric entry, blanks and zero override at mobile width", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "randomUUID", { value: undefined }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Numeric customer");
  await page.getByLabel("Job name *").fill("Numeric entry");
  for (const kind of ["Labour", "Materials", "Other Costs"]) {
    await page
      .getByRole("button", {
        name: kind === "Other Costs" ? "Subcontractors & Other Costs" : kind,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name:
          kind === "Labour"
            ? "Add labour"
            : kind === "Materials"
              ? "Add material"
              : "Add cost",
        exact: true,
      })
      .click();
    await page.getByLabel("Description *").fill(kind + " item");
    const cost = page.getByLabel(
      kind === "Labour" ? "Internal cost / hour ($)" : "Unit cost ($)",
      { exact: true },
    );
    await cost.click();
    await cost.pressSequentially("12.5");
    await expect(cost).toHaveValue("12.5");
    await cost.fill("");
    await expect(cost).toHaveValue("");
    await cost.blur();
    await expect(page.locator(".line-footer")).toContainText("$0.00");
    await cost.fill("18");
    const override = page.getByLabel("Selling price override ($)");
    await override.fill("0");
    await expect(page.locator(".line-footer")).toContainText("$0.00");
    await override.fill("");
    await expect(override).toHaveValue("");
    if (kind === "Materials") {
      await page.getByLabel("Required quantity").fill("40");
      await page.getByLabel("Waste (%)").click();
      await page.getByLabel("Waste (%)").pressSequentially("10");
      await page.getByLabel("Markup (%)", { exact: true }).fill("15");
      await expect(
        page.getByLabel("Purchase quantity (calculated)"),
      ).toContainText("44");
      await expect(page.locator(".line-footer")).toContainText("$910.80");
    }
    if (kind === "Other Costs") {
      await page.getByLabel("Markup (%)", { exact: true }).fill("10");
      await expect(page.locator(".line-footer")).toContainText("$19.80");
    }
  }
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  const overhead = page.getByLabel("Overhead / profit addition (%)");
  await overhead.click();
  await overhead.pressSequentially("12");
  await expect(overhead).toHaveValue("12");
  await overhead.fill("");
  await expect(overhead).toHaveValue("");
  await page.getByLabel("Target minimum gross margin (%)").fill("70");
  await expect(page.locator(".margin-warning")).toBeVisible();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Numeric entry/ }).click();
  await page.getByRole("button", { name: "Pricing", exact: true }).click();
  await expect(overhead).toHaveValue("0");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "/tmp/backwoods-v2-pricing.png",
    fullPage: true,
  });
});

test("mobile Deck template, customer document details and reviewed plans takeoff", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Deck customer");
  await page.getByLabel("Job name *").fill("Muskoka deck");
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Apply construction template").selectOption("deck");
  await page
    .getByLabel("Payment / deposit schedule")
    .fill("20% deposit, balance at completion.");
  await page
    .getByLabel("Assumptions", { exact: true })
    .fill("Access is available.");
  await page
    .getByLabel("Exclusions", { exact: true })
    .fill("Landscaping excluded.");
  await page.getByLabel("Permit responsibility").fill("Owner obtains permits.");
  await page
    .getByLabel("Engineering responsibility")
    .fill("Engineer supplies reviewed design.");
  await page
    .getByLabel("Estimated project timeline")
    .fill("Two weeks after permits.");
  await page.getByLabel("Group detailed quote by scope").check();
  await page.getByRole("button", { name: "Materials", exact: true }).click();
  await expect(page.getByLabel("Required quantity").first()).toHaveValue("0");
  await page.getByLabel("Required quantity").nth(1).fill("40");
  await page.getByLabel("Unit cost ($)", { exact: true }).nth(1).fill("18");
  await page.getByLabel("Waste (%)").nth(1).fill("10");
  await page.getByLabel("Markup (%)", { exact: true }).nth(1).fill("15");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  const pdf = await page.pdf({ format: "A4" });
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "engineer-plans.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(
    page.getByRole("button", { name: "engineer-plans.pdf", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add takeoff item" }).click();
  await page.getByLabel("Takeoff description").fill("Reviewed deck boards");
  await page.getByLabel("Takeoff quantity").fill("12");
  await page.getByLabel("Takeoff unit").fill("board");
  await page
    .getByLabel("Source document")
    .selectOption({ label: "engineer-plans.pdf" });
  await page.getByLabel("Page number (optional)").fill("1");
  await expect(
    page.getByLabel("Convert reviewed item to estimate"),
  ).toBeDisabled();
  await page.getByLabel("Review status").selectOption("Reviewed");
  await expect(
    page.getByLabel("Convert reviewed item to estimate"),
  ).toBeEnabled();
  await page.getByLabel("Replace engineer-plans.pdf").setInputFiles({
    name: "revised-plans.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.getByLabel("Review status")).toHaveValue("Proposed");
  await page.getByLabel("Review status").selectOption("Reviewed");
  await page
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Materials");
  await expect(
    page.getByText("Converted to an estimate line.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Muskoka deck/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await expect(page.getByLabel("Takeoff quantity")).toHaveValue("12");
  await page
    .getByRole("button", { name: "revised-plans.pdf", exact: true })
    .click();
  await expect(page.locator(".plan-preview")).toBeVisible();
  await expect(page.getByText(/Page 1 \/ \d+/)).toBeVisible();
  await expect(page.getByLabel("Drawing page 1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "/tmp/backwoods-v2-takeoff.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  await page.getByLabel("Customer quote mode").selectOption("Detailed");
  const doc = page.locator(".customer-document");
  await expect(doc).toContainText("Decking");
  await expect(doc).toContainText("$910.80");
  await expect(doc).toContainText("20% deposit");
  await expect(doc).toContainText("Owner obtains permits.");
  await expect(doc).not.toContainText("hour");
  await expect(doc).not.toContainText("44 board");
  await expect(doc).not.toContainText("engineer-plans.pdf");
  await expect(doc).not.toContainText("Review status");
  await page.getByLabel("Show quantities", { exact: true }).uncheck();
  await expect(doc).not.toContainText("40 board");
  await page
    .locator(".customer-document")
    .screenshot({ path: "/tmp/backwoods-v2-customer.png" });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".preview-options")).toBeHidden();
  await page.pdf({ path: "/tmp/backwoods-v2-quote.pdf", format: "A4" });
});

test("V1 browser records migrate safely and sent quotes stay locked after defaults changes", async ({
  page,
}) => {
  const v1 = JSON.parse(JSON.stringify(seed()));
  v1.version = 1;
  delete v1.quoteDefaults;
  for (const k of [
    "internalLabourCost",
    "otherMarkup",
    "targetMargin",
    "validityDays",
  ])
    delete v1.settings[k];
  for (const q of v1.quotes) {
    delete q.details;
    delete q.documents;
    delete q.takeoff;
    delete q.snapshot;
    for (const l of q.lines) {
      delete l.waste;
      delete l.scopeGroup;
    }
  }
  const raw = JSON.stringify(v1),
    sentPrice = calculate(estimateFor(seed().quotes[1])).subtotal;
  await page.goto("/");
  await page.evaluate(
    (raw) => localStorage.setItem("backwoods-quotes-v1", raw),
    raw,
  );
  await page.reload();
  await page.getByRole("button", { name: /Backyard privacy fence/ }).click();
  await page.getByRole("button", { name: "Labour", exact: true }).click();
  await expect(page.getByLabel("Internal cost / hour ($)")).toBeDisabled();
  await page.getByRole("button", { name: "Save quote", exact: true }).click();
  const result = await page.evaluate(() => ({
    store: JSON.parse(localStorage.getItem("backwoods-quotes-v1")!),
    backup: localStorage.getItem("backwoods-quotes-v1-backup"),
  }));
  expect(result.store.version).toBe(2);
  expect(result.backup).toBe(raw);
  expect(calculate(result.store.quotes[1].snapshot).subtotal).toBe(sentPrice);
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Internal labour cost ($/hour)").fill("50");
  await page.getByLabel("Customer labour rate ($/hour)").fill("120");
  await page.getByLabel("Other Costs / subcontractor markup (%)").fill("20");
  await page.getByLabel("Default quote validity (days)").fill("30");
  await page.getByLabel("Payment / deposit schedule").fill("Deposit required");
  await page.getByRole("button", { name: "Save defaults" }).click();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: /Backyard privacy fence/ }).click();
  await page.getByRole("button", { name: "Labour", exact: true }).click();
  await expect(page.getByLabel("Customer rate / hour ($)")).toHaveValue("75");
  await page.getByRole("button", { name: "Back to workspace" }).click();
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await expect(page.getByLabel("Payment / deposit schedule")).toHaveValue(
    "Deposit required",
  );
  await expect(page.getByLabel("Expiry date (optional)")).not.toHaveValue("");
  await page.getByRole("button", { name: "Labour", exact: true }).click();
  await page.getByRole("button", { name: "Add labour", exact: true }).click();
  await expect(page.getByLabel("Internal cost / hour ($)")).toHaveValue("50");
  await expect(page.getByLabel("Customer rate / hour ($)")).toHaveValue("120");
});
