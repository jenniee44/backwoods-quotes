import { test, expect } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
async function setup(page: import("@playwright/test").Page, pages = 1) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic-preview.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(constructionPdf({ pages })),
  });
  await expect(page.getByLabel("Drawing page 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Auto-Generate Detail Views", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /suggested views generated/ }),
  ).toBeVisible();
}
test("all 20 automatic thumbnails load while collapsed and open accessible zoom, pan, source map and adjustment controls", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, 20);
  const thumbnails = page.locator(".detail-thumbnail");
  await expect(thumbnails).toHaveCount(20);
  await expect
    .poll(() =>
      thumbnails.evaluateAll(
        (nodes) =>
          nodes.filter(
            (n) =>
              (n as HTMLImageElement).complete &&
              (n as HTMLImageElement).naturalWidth > 0,
          ).length,
      ),
    )
    .toBe(20);
  await expect(page.locator(".detail-inspector[open]")).toHaveCount(0);
  await expect(
    page.getByLabel("I inspected all selected automatic detail views"),
  ).toBeEnabled();
  await page.locator(".detail-thumbnail-button").first().click();
  const inspector = page.locator(".detail-inspector[open]");
  await expect(inspector).toHaveCount(1);
  await expect(
    inspector.getByLabel("Selected detail region on original PDF"),
  ).toBeVisible();
  await expect
    .poll(() =>
      inspector
        .locator("canvas")
        .evaluate((c) => (c as HTMLCanvasElement).width),
    )
    .toBe(600);
  await expect(inspector.getByLabel("Detail name")).toBeVisible();
  await expect(
    inspector.getByRole("button", { name: "Apply region adjustment" }),
  ).toBeVisible();
  await inspector.getByLabel("Detail preview zoom (%)").fill("100");
  const scroller = inspector.locator(".detail-image-scroll");
  await scroller.scrollIntoViewIfNeeded();
  const b = (await scroller.boundingBox())!;
  await page.mouse.move(b.x + 100, b.y + 100);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, b.y + 40);
  await page.mouse.up();
  expect(
    await scroller.evaluate((n) => n.scrollLeft + n.scrollTop),
  ).toBeGreaterThan(0);
  await page.locator(".detail-thumbnail-button").nth(1).click();
  await expect(page.locator(".detail-inspector[open]")).toHaveCount(1);
  await expect(page.locator(".detail-inspector[open]")).toContainText("Page 2");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("preview load failure disables inspection confirmation and analysis until the image is available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    document.addEventListener(
      "load",
      (e) => {
        const image = e.target;
        if (
          image instanceof HTMLImageElement &&
          image.classList.contains("detail-thumbnail")
        )
          image.src = "data:image/png;base64,invalid";
      },
      true,
    );
  });
  await setup(page);
  await expect(
    page.getByText("This preview could not be loaded.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("I inspected all selected automatic detail views"),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeDisabled();
});
