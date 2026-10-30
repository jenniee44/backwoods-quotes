import { test, expect } from "@playwright/test";
import { sectionTakeoffFixture } from "../src/sectionTakeoff.fixture";
import { dimensionFixture } from "../src/structuredTakeoff.fixture";
import { constructionPdf } from "./fixtures/constructionPdf";
import { storageKey } from "../src/model";
for (const width of [1366, 390])
  test(`section evidence produces editable preliminary counts without purchase approval at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let calls = 0;
    await page.route("**/api/plan-analysis", async (route) => {
      calls++;
      const source = route.request().postDataJSON().documents[0];
      const result = sectionTakeoffFixture();
      const joists = result.suggestions[0];
      joists.sourceFacts = joists.sourceFacts!.filter(
        (f) => !f.startsWith("Joist layout width"),
      );
      result.suggestions.push({
        ...structuredClone(joists),
        description: "Repeated deck joists",
        sourceFacts: [
          "Joist spacing: 16 in",
          "Same physical section shown in detail",
        ],
      });
      result.dimensionInventory = [
        {
          ...dimensionFixture({ assemblyRef: "SECTION-J", orientation: 90 }),
          documentId: source.id,
          page: 1,
        },
      ];
      for (const t of result.suggestions) t.documentId = source.id;
      await route.fulfill({ json: result });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Create New Quote" }).click();
    await page.getByLabel("Customer name *").fill("Synthetic test customer");
    await page.getByLabel("Job name *").fill("Synthetic section quantities");
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
      name: "Synthetic.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        constructionPdf({
          rotation: 90,
          notes: ["SYNTHETIC SECTIONS", "DO NOT SCALE DRAWINGS"],
        }),
      ),
    });
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    const summary = page.getByRole("region", {
      name: "Material Takeoff Summary",
      exact: true,
    });
    await expect(summary).toContainText("13 joists");
    await expect(summary).toContainText("3 runs");
    await expect(summary).toContainText("26 cut pieces");
    await expect(summary).toContainText("32′ 0″");
    await expect(
      page.getByRole("button", { name: /Final Shopping List/ }),
    ).toContainText("(0)");
    await page.getByRole("button", { name: "Save quote", exact: true }).click();
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic section quantities/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await expect(summary).toContainText("13 joists");
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      storageKey,
    );
    const q = stored.quotes.find(
      (q: { name: string }) => q.name === "Synthetic section quantities",
    );
    expect(
      q.takeoff.every((t: { status: string }) => t.status !== "Approved"),
    ).toBe(true);
    expect(q.lines).toHaveLength(0);
    expect(
      q.takeoff.filter(
        (t: { assemblyReference: string; status: string }) =>
          t.assemblyReference === "SECTION-J" && t.status !== "Rejected",
      ),
    ).toHaveLength(1);
    expect(
      q.analysisReports
        .at(-1)
        .dimensions.some(
          (d: { drawingDimensions?: unknown[] }) => d.drawingDimensions?.length,
        ),
    ).toBe(true);
    expect(calls).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
