import { test, expect } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
import type { AnalysisDocument } from "../shared/analysis";
const fact = "NEW DECK A RECTANGULAR DECKING LENGTH 16 ft WIDTH 12 ft";
test("complete multi-page construction PDF needs no manual views; repeated materials do not inflate quantities", async ({
  page,
}) => {
  const original = Buffer.from(
    constructionPdf({
      pages: 3,
      pageDrawing: [
        "1 w 300 500 960 720 re S " +
          Array.from(
            { length: 13 },
            (_, i) => `${300 + i * 80} 500 m ${300 + i * 80} 1220 l S`,
          ).join(" ") +
          " 300 480 m 1260 480 l S 280 500 m 280 1220 l S " +
          [300, 620, 940, 1260].map((x) => `${x - 8} 492 16 16 re S`).join(" "),
        "2 w 300 1000 m 1260 1000 l S 300 1010 m 1260 1010 l S " +
          [300, 620, 940, 1260]
            .map((x) => `${x} 700 m ${x} 1000 l S ${x - 20} 670 40 30 re S`)
            .join(" "),
        "1 w 300 600 250 400 re S 320 620 210 350 re S 650 600 200 250 re S 650 850 m 850 850 l S 650 840 m 850 840 l S",
      ],
      pageNotes: [
        [
          fact,
          "NEW POSTS 6x6 PT COUNT 4",
          "JOISTS 2x6 PT 16 IN O/C",
          "DO NOT SCALE DRAWINGS",
        ],
        [
          "ELEVATION SAME DECK A POSTS 6x6 PT COUNT 4",
          "BEAM B-1 3 PLY 2x10 PT",
        ],
        [
          "CONNECTION LUS26 JOIST HANGERS",
          "FOOTING DEPTH UNREADABLE CONTRACTOR INPUT REQUIRED",
        ],
      ],
    }),
    "ascii",
  );
  let sent: AnalysisDocument[] = [];
  await page.route("**/api/plan-analysis", async (route) => {
    sent = route.request().postDataJSON().documents;
    const r = analysisFixture(sent[0].id);
    const p = {
      ...r.suggestions[1],
      description: "6x6 PT posts",
      specification: "6x6 PT",
      quantity: 4,
      location: "Deck A",
      notes: "New work",
      sourceFacts: ["Four new Deck A posts on page 1"],
      warnings: [],
      unit: "each",
    };
    r.dimensions = [];
    r.suggestions = [
      p,
      { ...p, page: 2, sourceFacts: ["Same four new Deck A posts on page 2"] },
      {
        ...p,
        description: "Decking area",
        specification: "PT decking",
        quantity: null,
        unit: "sq ft",
        sourceFacts: [fact],
      },
      {
        ...p,
        description: "Concrete footing",
        specification: "Depth unreadable",
        quantity: null,
        sourceFacts: ["Footing depth unreadable on page 3"],
        page: 3,
        warnings: ["Contractor Input Required"],
      },
    ];
    await route.fulfill({ json: r });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Synthetic fixture");
  await page.getByLabel("Job name *").fill("Synthetic multi-page deck");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic-complete.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  expect(sent).toHaveLength(1);
  expect(Buffer.from(sent[0].data.split(",")[1], "base64")).toEqual(original);
  expect(sent[0].pdfText?.pageCount).toBe(3);
  expect(sent[0].pdfText?.pages.map((p) => p.text).join()).toContain(
    "FOOTING DEPTH UNREADABLE",
  );
  expect(sent[0].detailRegions!.length).toBeGreaterThan(0);
  expect(sent[0].detailRegions!.length).toBeLessThanOrEqual(8);
  expect(sent[0].detailRegions!.every((d) => d.dpi === 250)).toBe(true);
  const list = page.locator(".preliminary-materials");
  await expect(list).toBeVisible();
  const posts = list.locator("tr").filter({ hasText: "6x6 PT" });
  await expect(posts).toHaveCount(1);
  await expect(posts).toContainText("4");
  await expect(list).toContainText("192");
  await expect(list).toContainText("Quantity needed");
  await expect(page.locator(".advanced-review")).not.toHaveAttribute("open");
  await expect(page.getByText(/Submitted detail views:/).first()).toBeVisible();
});
