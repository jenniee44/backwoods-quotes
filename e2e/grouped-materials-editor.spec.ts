import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
for (const width of [1366, 390])
  test(`grouped editable materials preserve separate assemblies at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic grouped editor";
    const base: TakeoffItem = {
      id: "beam-a",
      description: "Built-up deck beam",
      specification: "3-ply 2x10 PT",
      quantity: 3,
      unit: "runs",
      documentId: "synthetic",
      page: 1,
      notes: "New work",
      status: "Proposed",
      origin: "ai",
      confidence: "High",
      destination: "Materials",
      category: "Beams",
      workScope: "New work",
      included: true,
      location: "Assembly A",
      sourceFacts: ["Synthetic drawing observation"],
    };
    q.takeoff = [
      base,
      { ...base, id: "beam-b", page: 2, location: "Assembly B" },
      ...["a", "b"].map((id) => ({
        ...base,
        id: "joist-" + id,
        description: "Deck joists",
        specification: "2x6 PT",
        quantity: 12,
        unit: "boards",
        category: "Joists",
        location: "Assembly " + id,
      })),
      ...["a", "b"].map((id) => ({
        ...base,
        id: "hanger-" + id,
        description: "Simpson LUS26 joist hangers",
        specification: "Simpson LUS26",
        quantity: 12,
        unit: "each",
        category: "Connectors / fasteners",
        location: "Assembly " + id,
      })),
      {
        ...base,
        id: "existing",
        description: "Existing footing",
        workScope: "Existing work to remain",
        included: false,
      },
      {
        ...base,
        id: "note",
        description: "All fasteners shall be galvanized",
        quantity: null,
        specification: "Galvanized hardware",
        itemRole: "Document observation",
      },
    ];
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic grouped editor/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    const region = page.getByRole("region", { name: "Materials Summary" });
    await region
      .getByRole("button", { name: "Materials Summary", exact: true })
      .click();
    const table = region.locator(".grouped-materials-editor");
    await expect(table.locator(".material-category-row")).toHaveCount(3);
    await expect(table.locator("thead th")).toHaveText([
      "Material",
      "Specification",
      "Quantity",
      "Unit",
      "Include / Exclude",
      "Status",
    ]);
    await expect(table.locator(".summary-material-category[open]")).toHaveCount(
      0,
    );
    await expect(table.locator("input:visible,select:visible")).toHaveCount(0);
    await expect(table.locator(".material-category-grid")).toContainText([
      "To confirm",
      "To confirm",
      "To confirm",
    ]);
    await table.getByLabel("Edit assemblies: beam-a", { exact: true }).click();
    await expect(page.locator("#summary-beam-a")).toBeVisible();
    await expect(page.locator("#summary-beam-b")).toBeVisible();
    await expect(page.locator("#summary-beam-a")).not.toContainText(
      "Stock length",
    );
    await page.getByLabel("Quantity: beam-a", { exact: true }).fill("4");
    await region
      .getByRole("heading", { name: "Materials Summary", exact: true })
      .click();
    const saved = () =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).quotes.find(
            (q: { name: string }) => q.name === "Synthetic grouped editor",
          ).takeoff,
        storageKey,
      );
    await expect
      .poll(
        async () =>
          (await saved()).find((t: TakeoffItem) => t.id === "beam-a").quantity,
      )
      .toBe(4);
    expect(
      (await saved()).find((t: TakeoffItem) => t.id === "beam-b").quantity,
    ).toBe(3);
    expect((await saved()).map((t: TakeoffItem) => t.id)).toEqual(
      q.takeoff.map((t) => t.id),
    );
    await page
      .locator("#summary-beam-b")
      .getByRole("button", { name: "Review details" })
      .click();
    await expect(
      page.locator("#takeoff-beam-b .takeoff-advanced"),
    ).toHaveAttribute("open");
    await table.getByLabel("Edit assemblies: beam-a", { exact: true }).click();
    await expect(page.locator("#summary-beam-b")).not.toBeVisible();
    await page
      .locator("#takeoff-beam-b")
      .getByRole("button", { name: "Back to Materials Summary" })
      .click();
    await expect(page.locator("#summary-beam-b")).toBeVisible();
    await expect(page.locator("#summary-beam-b")).toHaveClass(
      /material-navigation-highlight/,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await region.screenshot({
      path: `/tmp/backwoods-grouped-materials-${width}.png`,
    });
  });
