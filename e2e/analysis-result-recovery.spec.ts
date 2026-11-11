import { test, expect, type Page } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
import { handleAnalysis, type Env } from "../server/handler";
const seedQuote = async (page: Page, name: string) => {
  const store = seed(),
    q = store.quotes[0];
  q.name = name;
  q.takeoff = [];
  q.analysisReports = [];
  q.documents = [
    {
      id: "synthetic-recovery",
      name: "Synthetic multi-page.pdf",
      type: "application/pdf",
      data:
        "data:application/pdf;base64," +
        btoa(
          constructionPdf({
            pages: 3,
            notes: ['2x8 PT joists @ 16" O/C', "DO NOT SCALE"],
            drawing: true,
          }),
        ),
      addedAt: "2026-01-01",
    },
  ];
  await page.goto("/");
  await page.evaluate(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.reload();
  return q;
};
const openPlans = async (page: Page, name: string) => {
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await page
    .getByRole("button", { name: "2. Plans & AI", exact: true })
    .click();
};
for (const [state, code, status, heading] of [
  ["missing", "ANALYSIS_RESULT_MISSING", 404, "No saved AI results found"],
  ["running", "ANALYSIS_IN_PROGRESS", 202, "Analysis still running"],
  ["interrupted", "ANALYSIS_INTERRUPTED", 404, "Previous analysis interrupted"],
  [
    "storage-unavailable",
    "ANALYSIS_RESULTS_UNAVAILABLE",
    503,
    "Saved-result storage unavailable",
  ],
  [
    "failed",
    "ANALYSIS_PROVIDER_QUOTA",
    409,
    "Previous analysis needs attention",
  ],
] as const)
  test(`free recovery distinguishes ${state} without a paid request`, async ({
    page,
  }) => {
    const name = `Recovery state ${state}`;
    const q = await seedQuote(page, name);
    let paid = 0,
      recovery = 0;
    await page.route("**/api/plan-analysis", async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === "recover") {
        recovery++;
        await route.fulfill({ status, json: { state, code } });
      } else {
        paid++;
        await route.abort();
      }
    });
    await openPlans(page, name);
    await page
      .getByRole("button", {
        name: "Check for saved AI results — free",
        exact: true,
      })
      .click();
    await expect(page.getByText(heading, { exact: true })).toBeVisible({
      timeout: 45000,
    });
    expect(paid).toBe(0);
    expect(recovery).toBe(1);
    await expect(
      page.getByText("Analysis failed", { exact: true }),
    ).toHaveCount(0);
    const saved = await page.evaluate(
      ({ key, id }) =>
        JSON.parse(localStorage.getItem(key)!).quotes.find(
          (q: { id: string }) => q.id === id,
        ),
      { key: storageKey, id: q.id },
    );
    expect(saved.lines).toEqual(q.lines);
    expect(saved.pricing).toEqual(q.pricing);
    expect(saved.analysisReports ?? []).toHaveLength(0);
  });
for (const [width, loseResponse] of [
  [1366, false],
  [1366, true],
  [390, true],
] as const)
  test(`server-saved analysis ${loseResponse ? "survives a lost response" : "saves normally"} and refresh at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const name = "Server recovery after refresh",
      q = await seedQuote(page, name);
    const values = new Map<string, string>(),
      limits = new Map<string, string>();
    let paid = 0,
      recovery = 0;
    const kv = {
      get: async (k: string) => values.get(k) ?? null,
      put: async (k: string, v: string) => {
        values.set(k, v);
      },
    };
    const env: Env = {
      DEV_ALLOW_LOCAL: "true",
      ANALYSIS_RESULTS: kv,
      ANALYSIS_LIMITS: {
        get: async (k: string) => limits.get(k) ?? null,
        put: async (k: string, v: string) => {
          limits.set(k, v);
        },
      },
    };
    await page.route("**/api/plan-analysis", async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === "recover") recovery++;
      const request = new Request("http://localhost/api/plan-analysis", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const response = await handleAnalysis(request, env, {
        analyze: async (docs) => {
          paid++;
          expect(docs[0].pdfText?.pageCount).toBe(3);
          expect(docs[0].pdfText?.pages).toHaveLength(3);
          expect(docs[0].data).toBe(q.documents[0].data);
          expect((docs[0].detailRegions ?? []).length).toBeGreaterThan(0);
          return analysisFixture(docs[0].id);
        },
      });
      if (body.action !== "recover" && loseResponse) {
        expect(response.status).toBe(200);
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: response.status,
        body: await response.text(),
        contentType: "application/json",
      });
    });
    await openPlans(page, name);
    await page
      .getByRole("button", { name: "Analyze plans with AI", exact: true })
      .click();
    await expect.poll(() => values.size).toBeGreaterThan(0);
    await expect
      .poll(() => [...values.keys()].some((k) => k.endsWith(":result")), {
        timeout: 60000,
      })
      .toBe(true);
    if (!loseResponse)
      await expect(
        page.getByText("Analysis complete — needs review", { exact: true }),
      ).toBeVisible({ timeout: 45000 });
    await page.reload();
    await openPlans(page, name);
    await page
      .getByRole("button", {
        name: "Check for saved AI results — free",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(
        loseResponse
          ? "Analysis complete — needs review"
          : "Saved analysis already available",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 45000 });
    expect(paid).toBe(1);
    expect(recovery).toBe(loseResponse ? 1 : 0);
    const saved = await page.evaluate(
      ({ key, id }) =>
        JSON.parse(localStorage.getItem(key)!).quotes.find(
          (q: { id: string }) => q.id === id,
        ),
      { key: storageKey, id: q.id },
    );
    expect(saved.analysisReports).toHaveLength(1);
    expect(saved.takeoff.length).toBeGreaterThan(0);
    expect(saved.lines).toEqual(q.lines);
    expect(saved.pricing).toEqual(q.pricing);
    expect(
      saved.takeoff.some((t: { status: string }) => t.status === "Approved"),
    ).toBe(false);
    await page.reload();
    await openPlans(page, name);
    expect(paid).toBe(1);
  });
test("a failed original-quote save blocks paid work and never claims AI results were saved", async ({
  page,
}) => {
  const name = "Source persistence failure",
    q = await seedQuote(page, name);
  let requests = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    requests++;
    await route.abort();
  });
  await openPlans(page, name);
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key)
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return original.call(this, k, v);
    };
  }, storageKey);
  await page
    .getByRole("button", { name: "Analyze plans with AI", exact: true })
    .click();
  await expect(
    page.getByText("Analysis not started — quote not saved", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  expect(requests).toBe(0);
  const stored = await page.evaluate(
    ({ key, id }) =>
      JSON.parse(localStorage.getItem(key)!).quotes.find(
        (q: { id: string }) => q.id === id,
      ),
    { key: storageKey, id: q.id },
  );
  expect(stored.lines).toEqual(q.lines);
  expect(stored.analysisReports ?? []).toHaveLength(0);
});
