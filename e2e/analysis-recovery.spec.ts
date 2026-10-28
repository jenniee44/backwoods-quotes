import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import { analysisFixture } from "../shared/analysis.fixture";
import { constructionPdf } from "./fixtures/constructionPdf";
for (const width of [1366, 390])
  test(`analysis error remains useful, cooldown differs, retry recovers without changing saved estimates at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic analysis recovery";
    q.takeoff = [];
    q.documents = [];
    const manual = structuredClone(q.lines);
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic analysis recovery/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .getByLabel("Attach plans", { exact: true })
      .setInputFiles({
        name: "synthetic-recovery.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(
          constructionPdf({
            notes: ["Synthetic deck framing plan"],
            drawing: false,
          }),
        ),
      });
    let calls = 0;
    await page.route("**/api/plan-analysis", async (route) => {
      calls++;
      if (calls === 1) {
        await route.fulfill({
          status: 502,
          json: {
            code: "ANALYSIS_OUTPUT_LIMIT",
            error: "PRIVATE_PROVIDER_BODY_SHOULD_NOT_APPEAR",
          },
        });
        return;
      }
      if (calls === 2) {
        await route.fulfill({
          status: 409,
          json: { code: "ANALYSIS_IN_PROGRESS", retryAfterSeconds: 1 },
        });
        return;
      }
      const doc = route.request().postDataJSON().documents[0];
      await route.fulfill({ json: analysisFixture(doc.id) });
    });
    const analyze = page.getByRole("button", {
      name: "Analyze Plans",
      exact: true,
    });
    await analyze.click();
    await expect(
      page.getByText("Analysis failed", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/provider reached its response limit/),
    ).toBeVisible();
    await expect(
      page.getByText("PRIVATE_PROVIDER_BODY_SHOULD_NOT_APPEAR"),
    ).toHaveCount(0);
    await expect(analyze).toBeEnabled();
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).quotes[0].lines,
        storageKey,
      ),
    ).toEqual(manual);
    await analyze.click();
    await expect(
      page.getByText("Analysis already in progress", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Previous failure: The provider reached its response limit/,
      ),
    ).toBeVisible();
    await expect(analyze).toBeEnabled();
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff,
        storageKey,
      ),
    ).toHaveLength(0);
    await analyze.click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible();
    expect(calls).toBe(3);
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).quotes[0],
      storageKey,
    );
    expect(saved.lines).toEqual(manual);
    expect(
      saved.takeoff.every((t: { status: string }) => t.status === "Proposed"),
    ).toBe(true);
  });
