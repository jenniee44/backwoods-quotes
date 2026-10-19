import { test, expect } from "@playwright/test";
import { seed, storageKey, type TakeoffItem } from "../src/model";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
import { analysisFixture } from "../shared/analysis.fixture";
import { constructionPdf } from "./fixtures/constructionPdf";
const beam = (): TakeoffItem => ({
  id: "generic-beam",
  description: "3PLY 2X10 PT members",
  category: "Framing",
  specification: "3PLY 2X10 PT",
  quantity: null,
  unit: "boards",
  documentId: "synthetic",
  page: 1,
  location: "Deck A",
  origin: "ai",
  destination: "Materials",
  confidence: "Low",
  classification: "Contractor input required",
  status: "Proposed",
  included: true,
  workScope: "New work",
  notes: "New work",
  sourceFacts: [
    "Three source observations of the same specification; distinct beam count to confirm",
  ],
});
for (const width of [1366, 390])
  test(`saved generic beam Review Details selects the correct tool without observation-count inference at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic generic beam calculator";
    q.takeoff = [
      beam(),
      { ...beam(), id: "generic-2", page: 2 },
      { ...beam(), id: "generic-3", page: 3 },
    ];
    await page.goto("/");
    await page.evaluate(
      ({ key, store }) => localStorage.setItem(key, JSON.stringify(store)),
      { key: storageKey, store },
    );
    for (let reopen = 0; reopen < 2; reopen++) {
      await page.reload();
      await page
        .getByRole("button", { name: /Synthetic generic beam calculator/ })
        .click();
      await page
        .getByRole("button", { name: "Plans & Takeoff", exact: true })
        .click();
      await page
        .getByLabel("Edit assemblies: generic-beam", { exact: true })
        .getByRole("button", { name: "Review details", exact: true })
        .click();
      const panel = page.getByRole("group", {
        name: "Material purchasing calculator",
      });
      await expect(
        panel.getByLabel("Material calculator", { exact: true }),
      ).toHaveValue("beam-runs");
      await expect(
        panel.getByLabel("Show all construction calculators"),
      ).not.toBeChecked();
      await expect(
        panel.getByLabel("Number of separate beam runs", { exact: true }),
      ).toHaveValue(reopen ? "2" : "");
      if (!reopen) {
        await panel
          .getByLabel("Number of separate beam runs", { exact: true })
          .fill("2");
      }
      const first = panel.getByRole("region", { name: "Beam 1", exact: true });
      await expect(
        first.getByLabel("Number of plies", { exact: true }),
      ).toHaveValue(reopen ? "" : "3");
      await expect(
        first.getByLabel("Beam length — feet", { exact: true }),
      ).toHaveValue("");
      await first.getByLabel("Number of plies", { exact: true }).fill("");
      await first.getByLabel("Number of plies", { exact: true }).blur();
      await expect
        .poll(() =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff[0]
                .calculation?.inputs?.plies1,
            storageKey,
          ),
        )
        .toBeNull();
      await expect(panel).toContainText("Purchase quantity: To confirm");
    }
    // Explicit manual selection survives reopening instead of being auto-replaced.
    const panel = page.getByRole("group", {
      name: "Material purchasing calculator",
    });
    await panel
      .getByLabel("Material calculator", { exact: true })
      .selectOption("");
    await expect(
      panel.getByLabel("Material calculator", { exact: true }),
    ).toHaveValue("");
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff[0]
              .calculationBasis,
          storageKey,
        ),
      )
      .toContain("Manual calculator selection");
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic generic beam calculator/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .getByLabel("Edit assemblies: generic-beam", { exact: true })
      .getByRole("button", { name: "Review details", exact: true })
      .click();
    await expect(
      page
        .getByRole("group", { name: "Material purchasing calculator" })
        .getByLabel("Material calculator", { exact: true }),
    ).toHaveValue("");
  });
test("fresh generic spatial analysis and saved reopening prefill only distinct assemblies and explicitly associated lengths", async ({
  page,
}) => {
  await page.route("**/api/plan-analysis", async (route) => {
    const id = route.request().postDataJSON().documents[0].id,
      r = analysisFixture(id),
      beams = syntheticDeckBeams();
    beams[1].dimensions.push(fullDimension(beams[1], "14'-6\""));
    r.dimensions = [];
    r.sourceObservations = [];
    r.suggestions = [
      {
        ...r.suggestions[1],
        description: beam().description,
        specification: beam().specification,
        category: "Framing",
        quantity: null,
        unit: "boards",
        notes: "New work",
        location: "Deck A",
        sourceFacts: ["Spatially identified beam lines on framing plan"],
        beamAssemblies: [...beams, structuredClone(beams[0])],
      },
    ];
    await route.fulfill({ json: r });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Synthetic regression");
  await page.getByLabel("Job name *").fill("Synthetic fresh beam tool");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(constructionPdf(), "ascii"),
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
        .getByRole("button", { name: /Synthetic fresh beam tool/ })
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
      panel.getByLabel("Material calculator", { exact: true }),
    ).toHaveValue("beam-runs");
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
      ).toHaveValue(n === 2 ? "14" : "");
    }
    await expect(
      panel
        .getByRole("region", { name: "Beam 2", exact: true })
        .getByLabel("Beam length — inches", { exact: true }),
    ).toHaveValue("6");
    await expect(panel).toContainText("Purchase quantity: To confirm");
  }
});
