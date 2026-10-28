import { test, expect } from "@playwright/test";
import { diagnosticRegressionQuote } from "../src/diagnosticRegression.fixture";
import { seed, storageKey, type TakeoffItem } from "../src/model";
import { constructionPdf } from "./fixtures/constructionPdf";
for (const width of [1366, 390])
  test(`diagnostic-shaped saved analysis restores only supported beam evidence and groups joists at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = diagnosticRegressionQuote();
    const pdf = constructionPdf();
    q.documents[0].data =
      "data:application/pdf;base64," + Buffer.from(pdf).toString("base64");
    store.quotes = [q];
    const originalReports = structuredClone(q.analysisReports),
      originalLines = structuredClone(q.lines);
    let apiCalls = 0;
    await page.route("**/api/plan-analysis", async (route) => {
      apiCalls++;
      await route.abort();
    });
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    for (let reopen = 0; reopen < 2; reopen++) {
      await page.reload();
      await page
        .getByRole("button", { name: /Synthetic diagnostic deck/ })
        .click();
      await page
        .getByRole("button", { name: "Plans & Takeoff", exact: true })
        .click();
      const summary = page.getByRole("region", {
        name: "Material Takeoff Summary",
        exact: true,
      });
      await expect
        .poll(async () =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff.filter(
                (t: { id: string }) => t.id.includes(":recovered-beam:"),
              ).length,
            storageKey,
          ),
        )
        .toBe(1);
      await expect(
        summary.getByText(/Supported observations \(not a category total\)/),
      ).toContainText("1 run");
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).quotes[0],
        storageKey,
      );
      expect(
        saved.takeoff.filter((t: TakeoffItem) =>
          t.id.includes(":recovered-beam:"),
        ),
      ).toHaveLength(1);
      const recovered = saved.takeoff.find((t: TakeoffItem) =>
        t.id.includes(":recovered-beam:"),
      );
      expect(recovered.calculation.inputs).toEqual({ runs: 1, plies1: 3 });
      expect(recovered.status).toBe("Proposed");
      expect(saved.lines).toEqual(originalLines);
      expect(saved.analysisReports[0]).toMatchObject(originalReports![0]);
      expect(saved.analysisReports[0].beamSupportRecoveryVersion).toBe(1);
      await page
        .getByRole("button", { name: /Preliminary Shopping List/ })
        .click();
      const table = page.getByRole("table", { name: /Preliminary/ });
      await expect(
        table.getByRole("row").filter({ hasText: /Deck joists/ }),
      ).toHaveCount(1);
      await expect(table).toContainText(
        "Supported observations, not a total: 1 runs",
      );
    }
    expect(apiCalls).toBe(0);
  });
