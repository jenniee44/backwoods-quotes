import { test, expect, type Page } from "@playwright/test";
import { constructionPdf, constructionNotes } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
import type { AnalysisDocument } from "../shared/analysis";
async function editor(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Synthetic package test");
  await page.getByLabel("Job name *").fill("Package fixture");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
}
function paddedPdf(size = 1_500_000) {
  const original = constructionPdf();
  return Buffer.from(
    original.replace(
      "%%EOF",
      "%" + " ".repeat(size - original.length - 2) + "\n%%EOF",
    ),
    "ascii",
  );
}
test("four optimized 250 DPI detail views keep all provenance and unchanged original; size follows removal and inclusion", async ({
  page,
}) => {
  let request: { documents: AnalysisDocument[] } | undefined;
  await page.route("**/api/plan-analysis", async (route) => {
    request = route.request().postDataJSON();
    await route.fulfill({ json: analysisFixture(request!.documents[0].id) });
  });
  await editor(page);
  // Inflate synthetic PNG payloads to reproduce the real oversized-lossless case.
  // Image pixels are a real original-PDF render, not random image/OCR content.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (type, quality) {
      const data = original.call(this, type, quality);
      if (type !== "image/png" || this.width < 200) return data;
      const bytes = atob(data.split(",")[1]);
      return (
        "data:image/png;base64," +
        btoa(bytes + "\0".repeat(Math.max(0, 1_750_000 - bytes.length)))
      );
    };
  });
  const original = paddedPdf();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic-sheet.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
  await page.getByLabel("Zoom drawing").selectOption("3");
  const geometry: { x: number; y: number; width: number; height: number }[] =
    [];
  for (let i = 0; i < 4; i++) {
    await page
      .locator(".pdf-scroll-viewport")
      .evaluate((node, index) => node.scrollTo(index * 80, index * 30), i);
    await expect(page.locator(".pdf-canvas")).toHaveCSS("left", `${i * 80}px`);
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    geometry.push(
      await page.locator(".pdf-scroll-viewport").evaluate((node) => ({
        x: node.scrollLeft / 3,
        y: node.scrollTop / 3,
        width: node.clientWidth / 3,
        height: node.clientHeight / 3,
      })),
    );
    await page
      .getByRole("button", {
        name: "Include this view in analysis (250 DPI)",
        exact: true,
      })
      .click();
    await expect(page.locator(".pdf-detail-list .icon")).toHaveCount(i + 1);
  }
  const indicator = page.getByLabel("Analysis package", { exact: true });
  await expect(indicator).toContainText("Detail encoding optimized");
  await expect(indicator).toContainText("(4)");
  await expect(indicator).toContainText("Original files: 1.50 MB");
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  const source = request!.documents[0];
  expect(Buffer.from(source.data.split(",")[1], "base64")).toEqual(original);
  expect(source.detailRegions).toHaveLength(4);
  const sentBytes = source.detailRegions!.reduce(
    (sum, r) => sum + Buffer.from(r.data.split(",")[1], "base64").length,
    0,
  );
  expect(sentBytes).toBeLessThan(7_000_000);
  for (const [i, region] of source.detailRegions!.entries()) {
    expect(region).toMatchObject({
      page: 1,
      rotation: 0,
      dpi: 250,
      pixelWidth: Math.ceil((geometry[i].width * 250) / 72),
      pixelHeight: Math.ceil((geometry[i].height * 250) / 72),
    });
    expect(region.x).toBeCloseTo(geometry[i].x, 4);
    expect(region.y).toBeCloseTo(geometry[i].y, 4);
    if (region.encoding === "JPEG")
      expect(region.quality).toBeGreaterThanOrEqual(0.92);
  }
  // Pixel-level fine-line contrast check on the JPEG detail against an independent
  // original-operator render; no OCR or construction guesses are used.
  const jpeg = source.detailRegions!.find(
    (region) => region.encoding === "JPEG",
  )!;
  expect(jpeg).toBeDefined();
  const contrast = await page.evaluate(
    async ({ data, region }) => {
      const pdf = await import(
        /* @vite-ignore */ "/node_modules/pdfjs-dist/build/pdf.mjs"
      );
      pdf.GlobalWorkerOptions.workerSrc =
        "/node_modules/pdfjs-dist/build/pdf.worker.mjs";
      const task = pdf.getDocument({
        data: Uint8Array.from(atob(data.split(",")[1]), (c) => c.charCodeAt(0)),
      });
      const doc = await task.promise;
      const p = await doc.getPage(region.page);
      const canvas = document.createElement("canvas");
      canvas.width = region.pixelWidth;
      canvas.height = region.pixelHeight;
      const context = canvas.getContext("2d")!;
      const scale = 250 / 72;
      await p.render({
        canvas,
        canvasContext: context,
        viewport: p.getViewport({ scale, rotation: region.rotation }),
        transform: [1, 0, 0, 1, -region.x * scale, -region.y * scale],
      }).promise;
      const original = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const image = new Image();
      image.src = region.data;
      await image.decode();
      context.drawImage(image, 0, 0);
      const encoded = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let ink = 0,
        retained = 0;
      for (let i = 0; i < original.length; i += 4)
        if (original[i] < 128) {
          ink++;
          if (encoded[i] < 160) retained++;
        }
      await task.destroy();
      return { ink, retained: retained / ink };
    },
    { data: source.data, region: jpeg },
  );
  expect(contrast.ink).toBeGreaterThan(100);
  expect(contrast.retained).toBeGreaterThan(0.98);
  for (const note of constructionNotes)
    expect(source.pdfText?.pages.map((p) => p.text).join(" ")).toContain(note);
  await page
    .getByRole("button", { name: "Remove detail view 1" })
    .first()
    .click();
  await expect(indicator).toContainText("(3)");
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Include in analysis").uncheck();
  await expect(indicator).toContainText("Estimated total: 0.00 MB");
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Include in analysis").check();
  await page
    .getByLabel("Replace synthetic-sheet.pdf", { exact: true })
    .setInputFiles({
      name: "replacement-fixture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(constructionPdf(), "ascii"),
    });
  await expect(indicator).toContainText("Original files: 0.00 MB");
  await expect(indicator).toContainText("(0)");
  await expect(page.locator(".pdf-detail-list")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Remove document replacement-fixture.pdf" })
    .click();
  await expect(indicator).toContainText("Estimated total: 0.00 MB");
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  await expect(page.locator(".customer-document")).not.toContainText(
    /synthetic-sheet|sourceObservations|Detail encoding|PRIVATE_PLAN_TEXT_ONLY/,
  );
});

test("oversized originals show a pre-analysis warning and make no API request; deselecting updates the package", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    calls++;
    await route.fulfill({ json: {} });
  });
  await editor(page);
  const original = paddedPdf(1_900_000);
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles(
    Array.from({ length: 5 }, (_, i) => ({
      name: `synthetic-${i}.pdf`,
      mimeType: "application/pdf",
      buffer: original,
    })),
  );
  const indicator = page.getByLabel("Analysis package", { exact: true });
  await expect(indicator.getByRole("alert")).toContainText(
    "9.50 MB; allowed size is 8 MB",
  );
  await expect(indicator.getByRole("alert")).toContainText("synthetic-4.pdf");
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeDisabled();
  expect(calls).toBe(0);
  await expect(page.getByLabel("Include in analysis")).toHaveCount(5);
  await page.getByLabel("Include in analysis").last().uncheck();
  await expect(indicator).toContainText("Estimated total: 7.60 MB");
  await expect(indicator.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(0);
});
