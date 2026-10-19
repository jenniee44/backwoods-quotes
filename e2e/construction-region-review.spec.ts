import { test, expect } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
import { overlap } from "../src/autoDetailRegions";
import type { AnalysisDocument } from "../shared/analysis";
const note = (x: number, y: number, text: string, angle = 0) =>
  `BT /F1 6 Tf ${angle === 90 ? `0 1 -1 0 ${x} ${y}` : angle === 180 ? `-1 0 0 -1 ${x} ${y}` : `1 0 0 1 ${x} ${y}`} Tm (${text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")}) Tj ET`;
function drawing() {
  const beams = [500, 800, 1100]
    .map(
      (y) =>
        `2 w 300 ${y} m 1450 ${y} l S ` +
        [350, 750, 1150].map((x) => note(x, y + 15, "3PLY 2X10 PT")).join(" "),
    )
    .join(" ");
  const title = Array.from({ length: 15 }, (_, i) =>
    note(
      2050,
      1400 - i * 16,
      i % 2
        ? "PROJECT NAME AND POSTAL CODE"
        : "FOUNDATION AND DECK FRAMING PLAN",
      180,
    ),
  ).join(" ");
  return constructionPdf({
    width: 2400,
    height: 1600,
    rotation: 180,
    notes: [],
    drawing: false,
    pageDrawing: [
      beams +
        title +
        note(750, 1400, "JOISTS 2X6 PT AT 16 IN O/C") +
        note(1650, 400, "FOOTING 12 IN DIAMETER VERIFY FIELD DEPTH", 90) +
        " 1 w 1600 300 180 300 re S",
    ],
  });
}
for (const width of [1366, 390])
  test(`title-heavy rotated drawing uses meaningful nonredundant crops and direct gallery rotation at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    let calls = 0;
    let sent: AnalysisDocument[] = [];
    await page.route("**/api/plan-analysis", async (route) => {
      calls++;
      sent = route.request().postDataJSON().documents;
      await route.fulfill({ json: analysisFixture(sent[0].id) });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Create New Quote" }).click();
    await page
      .getByLabel("Customer name *")
      .fill("Synthetic region regression");
    await page.getByLabel("Job name *").fill("Synthetic title-heavy plan");
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    const original = Buffer.from(drawing(), "ascii");
    await page
      .getByLabel("Attach plans", { exact: true })
      .setInputFiles({
        name: "synthetic-framing.pdf",
        mimeType: "application/pdf",
        buffer: original,
      });
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    // Saving a zero viewer turn must not force every detail to page orientation.
    await page
      .getByRole("button", { name: "Rotate right", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Rotate left", exact: true })
      .click();
    await expect(page.getByLabel("Viewer rotation")).toHaveText("0°");
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    const views = sent[0].detailRegions!;
    expect(views.length).toBeGreaterThan(1);
    expect(views.length).toBeLessThanOrEqual(8);
    expect(Buffer.from(sent[0].data.split(",")[1], "base64")).toEqual(original);
    expect(views.some((v) => v.rotation === 90)).toBe(true);
    expect(views.some((v) => v.rotation === 0)).toBe(true);
    const titleRegion = {
      page: 1,
      x: 1850,
      y: 120,
      width: 550,
      height: 380,
      pageWidth: 2400,
      pageHeight: 1600,
      rotation: 0,
      label: "Title",
      score: 0,
    };
    for (const v of views) {
      expect(v.dpi).toBe(250);
      expect(v.sourcePageRotation).toBe(180);
      expect(overlap({ ...v, label: "", score: 0 }, titleRegion)).toBeLessThan(
        0.3,
      );
    }
    for (let a = 0; a < views.length; a++)
      for (let b = a + 1; b < views.length; b++)
        expect(
          overlap(
            { ...views[a], label: "", score: 0 },
            { ...views[b], label: "", score: 0 },
          ),
        ).toBeLessThanOrEqual(0.31);
    await page
      .getByRole("button", {
        name: `View AI Detail Images (${views.length})`,
        exact: true,
      })
      .click();
    const first = page.getByRole("button", {
      name: "Inspect submitted image 1",
      exact: true,
    });
    await first.click();
    const enlarged = page.getByAltText("Exact submitted detail enlarged");
    await expect(enlarged).toHaveAttribute("src", views[0].data);
    await page
      .getByRole("button", { name: "Rotate inspection right", exact: true })
      .click();
    await expect(enlarged).toHaveAttribute("data-inspection-rotation", "90");
    await expect(enlarged).toHaveAttribute("src", views[0].data);
    await page
      .getByRole("button", { name: "Zoom in submitted image", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Submitted image inspection" }),
    ).toContainText("125%");
    await page
      .getByRole("button", {
        name: "Prepare rotated replacement for next analysis",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(/Rotated replacement prepared for a future analysis/),
    ).toBeVisible();
    await expect(
      page.locator(".pdf-detail-list .detail-thumbnail"),
    ).toHaveCount(views.length);
    await expect(enlarged).toHaveAttribute("src", views[0].data);
    expect(calls).toBe(1);
  });
