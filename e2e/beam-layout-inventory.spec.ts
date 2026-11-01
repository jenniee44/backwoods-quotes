import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import { analysisFixture } from "../shared/analysis.fixture";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
import { constructionPdf } from "./fixtures/constructionPdf";
for (const width of [1366, 390])
  test(`plan beam inventory reaches separate review lines without stock quantities at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.name = "Beam inventory regression";
    q.takeoff = [];
    q.documents = [];
    await page.goto("/");
    await page.evaluate(
      ({ key, store }) => localStorage.setItem(key, JSON.stringify(store)),
      { key: storageKey, store },
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Beam inventory regression/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    let calls = 0;
    await page.route("**/api/plan-analysis", async (route) => {
      calls++;
      const doc = route.request().postDataJSON().documents[0],
        r = analysisFixture(doc.id);
      r.suggestions = [];
      r.sourceObservations = [];
      r.dimensions = [];
      r.beamLayoutInventory = syntheticDeckBeams().map((b) => ({
        ...b,
        view: "Framing plan",
        documentId: doc.id,
        location: "Main plan beam grid",
        sourceDetailView: null,
        scope: "Requires scope confirmation",
      }));
      const {
        documentId: _id,
        location: _location,
        sourceDetailView: _detail,
        ...oneBeam
      } = r.beamLayoutInventory[0];
      void _id;
      void _location;
      void _detail;
      r.suggestions = [
        {
          ...analysisFixture(doc.id).suggestions[1],
          description: "Primary timber beam",
          specification: "3PLY 2X10 PT",
          category: "Beams",
          quantity: 1,
          unit: "each",
          location: "Earlier single-line observation",
          beamAssemblies: [oneBeam],
        },
      ];
      await route.fulfill({ json: r });
    });
    await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
      name: "Synthetic.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        constructionPdf({
          width: 900,
          height: 700,
          rotation: 180,
          notes: [
            "FRAMING PLAN",
            "3PLY 2X10 PT",
            "3PLY 2X10 PT",
            "3PLY 2X10 PT",
          ],
          pageDrawing: [
            "100 180 m 800 180 l S 100 350 m 800 350 l S 100 520 m 800 520 l S",
          ],
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
    for (let reopen = 0; reopen < 2; reopen++) {
      if (reopen) {
        await page.reload();
        await page
          .getByRole("button", { name: /Beam inventory regression/ })
          .click();
        await page
          .getByRole("button", { name: "Plans & Takeoff", exact: true })
          .click();
      }
      await page
        .getByRole("button", { name: /Preliminary Shopping List/ })
        .click();
      await page
        .locator(".preliminary-materials")
        .getByRole("button", { name: "Review details", exact: true })
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
        await expect(
          card.getByLabel("Stock board length (ft)", { exact: true }),
        ).toHaveValue("");
      }
      await panel
        .getByText("Drawing associations and references", { exact: true })
        .click();
      const layout = panel.getByRole("region", {
        name: "Proposed physical beam lines",
      });
      await expect(layout.locator(".beam-line-summary")).toHaveCount(3);
      await expect(layout).toContainText("Written dimensions:");
      await expect(layout).toContainText(
        "Missing: a written full-run dimension",
      );
      await expect(layout).toContainText("Support positions: 4");
      await expect(panel).toContainText("Purchase quantity: To confirm");
    }
    expect(calls).toBe(1);
  });
