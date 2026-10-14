import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import { analysisFixture } from "../shared/analysis.fixture";
import { addAnalysisSuggestions } from "../src/planAnalysis";
import { constructionPdf } from "./fixtures/constructionPdf";
for (const width of [1366, 390])
  test(`completed drawing analysis opens automatically populated but unverified beams at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic auto beam proposals";
    q.documents = [
      {
        id: "synthetic",
        name: "Synthetic drawing.pdf",
        type: "application/pdf",
        addedAt: "2026-01-01",
        data:
          "data:application/pdf;base64," +
          Buffer.from(constructionPdf()).toString("base64"),
      },
    ];
    const result = analysisFixture("synthetic");
    result.suggestions = [
      {
        ...result.suggestions[0],
        description: "Deck beams",
        specification: "3PLY 2X10 PT",
        destination: "Materials",
        category: "Beams",
        confidence: "High",
        classification: "Plan fact",
        quantity: null,
        unit: "runs",
        notes: "New work",
        assumptions: [],
        warnings: [],
        sourceFacts: [
          "Beam B1 length: 12 ft",
          "Beam B1 length: 12 ft",
          "Beam B2 length: 16 ft",
          "Beam B1 uses continuous unspliced boards.",
        ],
      },
    ];
    const next = addAnalysisSuggestions(q, result);
    store.quotes[0] = next;
    const originalLines = next.lines;
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic auto beam proposals/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .locator(".preliminary-materials")
      .getByRole("button", { name: "Review details" })
      .click();
    const panel = page.getByRole("group", {
      name: "Material purchasing calculator",
    });
    await expect(
      panel.getByLabel("Number of separate beam runs", { exact: true }),
    ).toHaveValue("2");
    await expect(panel.locator(".beam-advanced[open]")).toHaveCount(0);
    for (const [n, length] of [
      [1, 12],
      [2, 16],
    ]) {
      const beam = panel.getByRole("region", {
        name: `Beam ${n}`,
        exact: true,
      });
      await expect(
        beam.getByLabel("Number of plies", { exact: true }),
      ).toHaveValue("3");
      await expect(
        beam.getByLabel("Beam length — feet", { exact: true }),
      ).toHaveValue(String(length));
      await expect(
        beam.getByLabel("Stock board length (ft)", { exact: true }),
      ).toHaveValue("");
    }
    await panel.getByText("Available stock sizes", { exact: true }).click();
    await panel
      .getByLabel("Available stock lengths", { exact: true })
      .fill("12, 16");
    await panel.getByLabel("Waste allowance (%)", { exact: true }).click();
    await expect(
      panel.getByRole("region", { name: "Beam 1", exact: true }),
    ).toContainText("Suggested available stock: 12 ft");
    await expect(
      panel.getByRole("region", { name: "Beam 1", exact: true }),
    ).toContainText("Estimated boards before waste: 3");
    await expect(panel).toContainText("Purchase quantity: To confirm");
    await expect(
      page
        .locator(".line-card")
        .getByRole("button", { name: "Approve material", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /Final Shopping List/ }),
    ).toContainText("(0)");
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).quotes[0],
      storageKey,
    );
    expect(stored.lines).toEqual(originalLines);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      path: `/tmp/backwoods-automatic-beams-${width}.png`,
    });
  });
