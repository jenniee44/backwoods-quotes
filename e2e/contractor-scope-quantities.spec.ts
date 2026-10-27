import { test, expect } from "@playwright/test";
import { seed, storageKey, type TakeoffItem } from "../src/model";
for (const width of [1366, 390])
  test(`drawing proposals, editable preliminary quantities and independent pile scope at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic scope and quantities";
    const joists: TakeoffItem = {
      id: "deck",
      documentId: "synthetic",
      page: 1,
      description: "Deck joists",
      specification: '2x6 PT at 16" OC',
      quantity: null,
      unit: "boards",
      notes: "Confirm contract scope",
      origin: "ai",
      status: "Proposed",
      confidence: "High",
      destination: "Materials",
      workScope: "Requires scope confirmation",
      included: false,
      location: "Deck D1",
      materialInputs: [
        {
          field: "layoutLength",
          value: 16,
          unit: "ft",
          page: 1,
          evidence: "Written bounded D1 joist layout width 16 ft",
          readable: true,
        },
        {
          field: "spacing",
          value: 16,
          unit: "in",
          page: 1,
          evidence: 'D1 spacing 16" OC',
          readable: true,
        },
        {
          field: "layoutClear",
          value: 1,
          unit: "option",
          page: 1,
          evidence: "D1 clear regular layout without openings",
          readable: true,
        },
        {
          field: "edgeIncluded",
          value: 1,
          unit: "option",
          page: 1,
          evidence: "D1 both edge members shown",
          readable: true,
        },
      ],
    };
    const footing: TakeoffItem = {
      ...joists,
      id: "concrete",
      description: "Concrete footing and pier",
      specification: "Concrete engineering notes retained",
      sourceFacts: ["Original footing note retained"],
      materialInputs: [],
      workScope: "New work",
      included: true,
    };
    q.takeoff = [joists, footing];
    const manual = structuredClone(q.lines);
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic scope and quantities/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Preliminary Shopping List/ })
      .click();
    const row = page.locator("#summary-deck");
    await expect(row.locator('[data-label="Quantity"] strong')).toHaveText(
      "13",
    );
    await row.getByText("Calculation and evidence", { exact: true }).click();
    await expect(row).toContainText("ceil(16 ft × 12 / 16 in) + 1");
    await expect(row).toContainText("job scope");
    await row
      .getByLabel("Preliminary quantity: deck", { exact: true })
      .fill("14");
    await row.getByLabel("Preliminary unit: deck", { exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff[0]
              .quantity,
          storageKey,
        ),
      )
      .toBe(14);
    const scope = page.locator(".contractor-scope");
    await scope.locator("summary").click();
    await scope
      .getByLabel("Scope description", { exact: true })
      .fill("Subcontracted helical piles");
    await scope
      .getByLabel("Contractor scope quantity", { exact: true })
      .fill("12");
    await scope
      .getByLabel("Scope quantity unit", { exact: true })
      .fill("piles");
    await scope.getByLabel(/Concrete footing and pier · page 1/).check();
    await scope.getByLabel(/This is my included job scope/).check();
    await scope.getByRole("button", { name: "Add scope for review" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff.length,
          storageKey,
        ),
      )
      .toBe(3);
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).quotes[0],
      storageKey,
    );
    expect(saved.takeoff[1].status).toBe("Rejected");
    expect(saved.takeoff[1].sourceFacts).toEqual(footing.sourceFacts);
    expect(saved.takeoff[2]).toMatchObject({
      destination: "Subcontractor",
      quantity: 12,
      status: "Proposed",
    });
    expect(saved.lines).toEqual(manual);
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic scope and quantities/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page.locator(".advanced-review > summary").click();
    await expect(page.locator(".advanced-review")).toContainText(
      "Subcontracted helical piles",
    );
  });
