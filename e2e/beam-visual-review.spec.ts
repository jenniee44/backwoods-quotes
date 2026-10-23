import { test, expect } from "@playwright/test";
import { seed, storageKey, type TakeoffItem } from "../src/model";
import { analysisFixture } from "../shared/analysis.fixture";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
import { constructionPdf } from "./fixtures/constructionPdf";
for (const width of [1366, 390])
  test(`overlapping beam observations become one unverified three-line review and survive reopening at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic parallel beam review";
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
      .getByRole("button", { name: /Synthetic parallel beam review/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    let context = false;
    await page.route("**/api/plan-analysis", async (route) => {
      const doc = route.request().postDataJSON().documents[0];
      context = doc.detailRegions?.some((r: { label: string }) =>
        r.label.startsWith("Beam assembly context"),
      );
      const result = analysisFixture(doc.id);
      const observation = {
        ...result.suggestions[0],
        description: "Deck beams",
        specification: "3PLY 2X10 PT",
        destination: "Materials" as const,
        category: "Beams",
        confidence: "High" as const,
        classification: "Plan fact" as const,
        quantity: null,
        unit: "runs",
        notes: "New work",
        location: "Rear deck",
        warnings: [],
        assumptions: [],
        sourceFacts: [
          "Distinct physical beam lines traced on original plan; repeated labels are references only.",
        ],
        beamAssemblies: syntheticDeckBeams(),
      };
      const repeated = structuredClone(observation);
      repeated.beamAssemblies.forEach((b) => {
        b.start.x += 0.001;
        b.end.x -= 0.001;
      });
      result.suggestions = [observation, repeated];
      result.sourceObservations = [];
      result.dimensions = [];
      await route.fulfill({ json: result });
    });
    const drawing = [840, 600, 360]
      .map(
        (y) =>
          `2 w 320 ${y} m 1280 ${y} l S ` +
          [320, 640, 960, 1280]
            .map((x) => `${x - 5} ${y - 5} 10 10 re S`)
            .join(" ") +
          " " +
          [480, 800, 1120]
            .map(
              (x) =>
                `BT /F1 6 Tf 1 0 0 1 ${x} ${y + 12} Tm (3PLY 2X10 PT) Tj ET`,
            )
            .join(" "),
      )
      .join(" ");
    await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
      name: "synthetic-parallel-beams.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        constructionPdf({
          width: 1600,
          height: 1200,
          notes: [],
          drawing: false,
          pageDrawing: [drawing],
        }),
      ),
    });
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    expect(context).toBe(true);
    for (let reopen = 0; reopen < 2; reopen++) {
      if (reopen) {
        await page.reload();
        await page
          .getByRole("button", { name: /Synthetic parallel beam review/ })
          .click();
        await page
          .getByRole("button", { name: "Plans & Takeoff", exact: true })
          .click();
      }
      await page
        .getByRole("button", { name: /Preliminary Shopping List/ })
        .click();
      await expect(
        page
          .locator(".preliminary-materials")
          .getByRole("button", { name: "Review details" }),
      ).toHaveCount(1);
      await page
        .locator(".preliminary-materials")
        .getByRole("button", { name: "Review details" })
        .click();
      const panel = page.getByRole("group", {
        name: "Material purchasing calculator",
      });
      await expect(
        panel.getByLabel("Number of separate beam runs", { exact: true }),
      ).toHaveValue("3");
      for (const n of [1, 2, 3]) {
        const card = panel.getByRole("region", {
          name: `Beam ${n}`,
          exact: true,
        });
        await expect(
          card.getByLabel("Number of plies", { exact: true }),
        ).toHaveValue("3");
        await expect(
          card.getByLabel("Beam length — feet", { exact: true }),
        ).toHaveValue("");
      }
      await expect(panel).toContainText("Purchase quantity: To confirm");
      await expect
        .poll(() =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff.filter(
                (t: TakeoffItem) => t.status === "Proposed",
              ).length,
            storageKey,
          ),
        )
        .toBe(1);
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).quotes[0],
        storageKey,
      );
      expect(saved.lines).toEqual(manual);
      expect(saved.takeoff).toHaveLength(2);
      expect(saved.takeoff[0].calculation.verified).toBe(false);
    }
  });
