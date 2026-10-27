import { consolidateTakeoff } from "../src/consolidateTakeoff";
import { expandSummaryEditors } from "./summaryEditorHelpers";
import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
async function setup(page: import("@playwright/test").Page) {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic preliminary review";
  const t: TakeoffItem = {
    id: "joist",
    description: "Supply and install deck joists from detail 1",
    specification: "2x6 PT at 16 in O/C",
    quantity: 12,
    unit: "boards",
    documentId: "synthetic",
    page: 1,
    notes: "New work",
    status: "Proposed",
    origin: "ai",
    confidence: "High",
    category: "Joists",
    destination: "Materials",
    location: "Rear deck",
    workScope: "New work",
    included: true,
    sourceFacts: ["Synthetic drawing reference"],
  };
  q.takeoff = [
    t,
    {
      ...t,
      id: "duplicate",
      description: "PT deck joists",
      category: "Miscellaneous",
      page: 2,
    },
    {
      ...t,
      id: "unknown",
      description: "Deck boards",
      specification: "PT decking",
      category: "Decking",
      quantity: null,
      unit: "boards",
      location: "Rear supports",
    },
    {
      ...t,
      id: "excluded",
      description: "Existing footing",
      category: "Footings / concrete",
      unit: "each",
      workScope: "Existing work to remain",
      included: false,
      status: "Rejected",
      location: "Existing",
    },
  ];
  q.takeoff = consolidateTakeoff(q.takeoff, true);
  const lines = q.lines;
  await page.goto("/");
  await page.evaluate(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Synthetic preliminary review/ })
    .click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  return lines;
}
for (const width of [1366, 390])
  test(
    "informational preliminary list, compact filters, names and approval workflow at " +
      width +
      "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const original = await setup(page);
      const region = page.getByRole("region", { name: "Materials Summary" });
      await expect(page.locator(".advanced-review")).not.toHaveAttribute(
        "open",
      );
      await region
        .getByRole("button", { name: /Preliminary Shopping List/ })
        .click();
      await expect(
        region.locator(".preliminary-materials tbody tr"),
      ).toHaveCount(2);
      await expect(region.locator("#summary-joist")).toContainText(
        "Deck joists",
      );
      await expect(region.locator("#summary-joist")).toContainText(
        "To confirm",
      );
      await expect(region.locator("#summary-unknown")).toContainText(
        "To confirm",
      );
      await expect(
        region.locator(".preliminary-materials #summary-excluded"),
      ).toHaveCount(0);
      await expect(
        region.locator("tbody input[aria-label^='Preliminary quantity:']"),
      ).toHaveCount(2);
      await expect(
        region.getByRole("button", {
          name: "Send approved materials to estimate",
        }),
      ).toHaveCount(0);
      await region
        .getByRole("button", { name: /Needs Attention — 2 material/ })
        .click();
      await expect(
        region.locator(
          ".material-category-row, .preliminary-materials > tbody > tr",
        ),
      ).toHaveCount(2);
      await expect(region.locator("#summary-unknown")).toBeVisible();
      await region
        .locator("#summary-unknown")
        .getByRole("button", { name: "Review details" })
        .click();
      await expect(
        page.locator("#takeoff-unknown .takeoff-advanced"),
      ).not.toHaveAttribute("open");
      await page
        .locator("#takeoff-unknown")
        .getByRole("button", { name: "Back to Materials Summary" })
        .click();
      await expect(region.locator("#summary-unknown")).toHaveClass(
        /material-navigation-highlight/,
      );
      await region
        .getByRole("button", { name: "Materials Summary", exact: true })
        .click();
      await expandSummaryEditors(page);
      await page.getByLabel("Quantity: unknown", { exact: true }).fill("4");
      await region
        .getByRole("heading", { name: "Materials Summary", exact: true })
        .click();
      await expect(
        region.locator(
          ".material-category-row, .preliminary-materials > tbody > tr",
        ),
      ).toHaveCount(0);
      await region.getByRole("button", { name: /All materials/ }).click();
      const desc = page.getByLabel("Material description: joist", {
        exact: true,
      });
      await expect(desc).toHaveValue("Deck joists");
      await desc.focus();
      await region
        .getByRole("heading", { name: "Materials Summary", exact: true })
        .click();
      // A friendly label must never silently replace the original observation.
      await expect
        .poll(() =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!)
                .quotes.find(
                  (q: { name: string }) =>
                    q.name === "Synthetic preliminary review",
                )
                .takeoff.find((t: TakeoffItem) => t.id === "joist").description,
            storageKey,
          ),
        )
        .toBe("Supply and install deck joists from detail 1");
      await expect
        .poll(() =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).quotes.find(
                (q: { name: string }) =>
                  q.name === "Synthetic preliminary review",
              ).lines,
            storageKey,
          ),
        )
        .toEqual(original);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await region.screenshot({
        path: "/tmp/backwoods-compact-summary-" + width + ".png",
      });
    },
  );
