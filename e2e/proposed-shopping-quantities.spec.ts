import { test, expect } from "@playwright/test";
import { seed, storageKey, type TakeoffItem } from "../src/model";
for (const width of [1366, 390])
  test(`saved deck quantity proposals reach both lists without approval at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic proposed quantities";
    const t: TakeoffItem = {
      id: "deck-joists",
      description: "Deck joists",
      specification: '2x6 PT at 16" O.C.',
      documentId: "synthetic",
      sourceDocumentName: "Synthetic deck.pdf",
      page: 2,
      location: "Deck D1",
      quantity: null,
      unit: "boards",
      notes: "New work",
      origin: "ai",
      destination: "Materials",
      status: "Proposed",
      confidence: "High",
      workScope: "New work",
      included: true,
      sourceFacts: [
        "Deck D1: Layout length: 16 ft; Member length: 10 ft; Stock length: 12 ft; Waste allowance: 0%",
      ],
      calculation: {
        kind: "joists",
        inputs: {},
        geometryConfirmed: true,
        verified: false,
      },
    };
    q.takeoff = [
      t,
      {
        ...t,
        id: "hardware",
        description: "Ledger screws",
        specification: "Specified ledger fastener",
        sourceFacts: ["Connection count: 8"],
        calculation: undefined,
      },
      {
        ...t,
        id: "retained",
        description: "Existing guard to remain",
        workScope: "Existing work to remain",
      },
    ];
    await page.goto("/");
    await page.evaluate(
      ({ key, store }) => localStorage.setItem(key, JSON.stringify(store)),
      { key: storageKey, store },
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic proposed quantities/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Material Takeoff Summary", exact: true })
      .click();
    const card = page.getByRole("article", {
      name: "Takeoff material: Deck joists",
      exact: true,
    });
    await expect(card).toContainText("13 joists");
    await expect(card).toContainText("13 boards — estimate");
    await expect(card).toContainText("page 2");
    await page
      .getByRole("button", { name: /Preliminary Shopping List/ })
      .click();
    const list = page.locator(".preliminary-materials");
    const row = list.locator("#summary-deck-joists");
    await expect(row.locator('[data-label="Quantity"] strong')).toHaveText(
      "13",
    );
    await expect(row.locator('[data-label="Unit"]')).toContainText("boards");
    await expect(row.locator('[data-label="Status"]')).toContainText(
      "Proposed",
    );
    await expect(list.locator("#summary-hardware")).toContainText("To confirm");
    await expect(list).not.toContainText("Existing guard to remain");
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff.find(
              (t: { id: string }) => t.id === "deck-joists",
            ).status,
          storageKey,
        ),
      )
      .toBe("Proposed");
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic proposed quantities/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Preliminary Shopping List/ })
      .click();
    await expect(
      page
        .locator(".preliminary-materials #summary-deck-joists")
        .locator('[data-label="Quantity"] strong'),
    ).toHaveText("13");
  });
