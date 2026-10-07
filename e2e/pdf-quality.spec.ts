import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { constructionPdf, constructionNotes } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
async function openPdf(page: import("@playwright/test").Page, pdf: Buffer) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("PDF quality test");
  await page.getByLabel("Job name *").fill("Original construction drawing");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "crisp-36x24-sheet.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(
    page.getByRole("button", { name: "crisp-36x24-sheet.pdf", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Drawing page 1")).toBeVisible();
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
}
test("vector PDF stays byte-exact; zoom rerenders detail; text plus 250 DPI region supplement native analysis input", async ({
  page,
}) => {
  const original = Buffer.from(constructionPdf(), "ascii");
  let request:
    | {
        documents: {
          data: string;
          pdfText: { pages: { text: string; status: string }[] };
          detailRegions: {
            dpi: number;
            data: string;
            pixelWidth: number;
            pixelHeight: number;
            page: number;
          }[];
        }[];
      }
    | undefined;
  await page.route("**/api/plan-analysis", async (route) => {
    request = route.request().postDataJSON();
    await route.fulfill({
      json: analysisFixture(route.request().postDataJSON().documents[0].id),
    });
  });
  await openPdf(page, original);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download crisp-36x24-sheet.pdf", exact: true })
    .click();
  const download = await downloadPromise;
  expect(readFileSync((await download.path())!)).toEqual(original);
  await page
    .getByRole("button", {
      name: "Include this view in analysis (250 DPI)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "too large" }),
  ).toBeVisible();
  await expect(page.locator(".pdf-detail-list")).toHaveCount(0);
  await page.getByLabel("Zoom drawing").selectOption("3");
  await page
    .locator(".pdf-scroll-viewport")
    .evaluate((element) => element.scrollTo(0, 0));
  await expect(
    page.getByText(/Original PDF view ready.*216 DPI/),
  ).toBeVisible();
  const geometry = await page.locator(".pdf-page-surface").evaluate((node) => {
    const canvas = node.querySelector("canvas")!;
    return {
      surfaceWidth: node.getBoundingClientRect().width,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      cssWidth: canvas.getBoundingClientRect().width,
    };
  });
  expect(geometry.surfaceWidth).toBe(2592 * 3);
  expect(geometry.canvasWidth).toBeLessThanOrEqual(2048);
  expect(geometry.canvasWidth).toBe(Math.ceil(geometry.cssWidth)); // DPR=1 fixture.
  await page
    .locator(".pdf-scroll-viewport")
    .screenshot({ path: "/tmp/backwoods-pdf-216dpi-preview.png" });
  await page
    .getByRole("button", {
      name: "Include this view in analysis (250 DPI)",
      exact: true,
    })
    .click();
  await expect(page.locator(".pdf-detail-list")).toContainText("250 DPI");
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  expect(request).toBeDefined();
  const source = request!.documents[0];
  expect(Buffer.from(source.data.split(",")[1], "base64")).toEqual(original);
  for (const note of constructionNotes)
    expect(source.pdfText.pages.map((p) => p.text).join(" ")).toContain(note);
  expect(source.pdfText.pages[0].status).toBe("Available");
  const region = source.detailRegions[0];
  expect(region.dpi).toBe(250);
  expect(region.page).toBe(1);
  const png = Buffer.from(region.data.split(",")[1], "base64");
  expect(png.readUInt32BE(16)).toBe(region.pixelWidth);
  expect(png.readUInt32BE(20)).toBe(region.pixelHeight);
  expect(region.pixelWidth).toBeGreaterThan(geometry.canvasWidth); // True 250 DPI rerender, not 216 DPI preview copy.
  // The PNG itself retains fine vector text; inspect as an artifact, not OCR.
  const imageUrl = region.data;
  await page.evaluate((data) => {
    const image = document.createElement("img");
    image.id = "detail-test-image";
    image.src = data;
    document.body.append(image);
  }, imageUrl);
  await page
    .locator("#detail-test-image")
    .screenshot({ path: "/tmp/backwoods-pdf-250dpi-detail.png" });
  await page.locator("#detail-test-image").evaluate((node) => node.remove());
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  const quote = page.locator(".customer-document");
  for (const secret of [
    "PRIVATE_PLAN_TEXT_ONLY",
    "crisp-36x24-sheet.pdf",
    "JOISTS:",
    "untrustedEmbeddedPdfText",
    "250 DPI",
    "detailRegions",
  ])
    await expect(quote).not.toContainText(secret);
  await page.emulateMedia({ media: "print" });
  const path = "/tmp/backwoods-pdf-quality-customer.pdf";
  await page.pdf({ path, format: "Letter" });
  expect(
    execFileSync("pdftotext", [path, "-"], { encoding: "utf8" }),
  ).not.toMatch(
    /PRIVATE_PLAN_TEXT_ONLY|crisp-36x24|JOISTS:|250 DPI|detailRegions/i,
  );
});
test("Retina preview is rendered at device density and scrolling rerenders original content", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  await openPdf(page, Buffer.from(constructionPdf(), "ascii"));
  await page.getByLabel("Zoom drawing").selectOption("1");
  await expect(
    page.getByText(/Original PDF view ready.*216 DPI/),
  ).toBeVisible();
  const pixels = await page.locator(".pdf-canvas").evaluate((node) => ({
    bitmap: (node as HTMLCanvasElement).width,
    css: node.getBoundingClientRect().width,
  }));
  expect(pixels.bitmap).toBe(Math.ceil(pixels.css * 3));
  await page
    .locator(".pdf-scroll-viewport")
    .evaluate((element) => element.scrollTo(800, 400));
  await expect(page.locator(".pdf-canvas")).toHaveCSS("left", "800px");
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
test("replaced originals invalidate temporary details rather than analyzing a stale crop", async ({
  page,
}) => {
  await openPdf(page, Buffer.from(constructionPdf(), "ascii"));
  await page.getByLabel("Zoom drawing").selectOption("3");
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
  await page
    .getByRole("button", {
      name: "Include this view in analysis (250 DPI)",
      exact: true,
    })
    .click();
  await expect(page.locator(".pdf-detail-list")).toBeVisible();
  await page.getByLabel("Replace crisp-36x24-sheet.pdf").setInputFiles({
    name: "replacement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      constructionPdf({ notes: ["REVISED DRAWING"] }),
      "ascii",
    ),
  });
  await expect(
    page.getByRole("button", { name: "replacement.pdf", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pdf-detail-list")).toHaveCount(0);
  await page.route("**/api/plan-analysis", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.documents[0].detailRegions).toBeUndefined();
    expect(body.documents[0].pdfText.pages[0].text).toContain(
      "REVISED DRAWING",
    );
    await route.fulfill({ json: analysisFixture(body.documents[0].id) });
  });
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
});
