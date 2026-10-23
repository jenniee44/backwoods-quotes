import { test, expect } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
import type { AnalysisDocument } from "../shared/analysis";
for (const width of [1366, 390]) {
  test(`original document is the default workspace with selectable source regions at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    let sent: AnalysisDocument[] = [];
    await page.route("**/api/plan-analysis", async (route) => {
      sent = route.request().postDataJSON().documents;
      await route.fulfill({ json: analysisFixture(sent[0].id) });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Create New Quote" }).click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    const original = Buffer.from(constructionPdf({ pages: 2, rotation: 180 }));
    await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
      name: "synthetic-workspace.pdf",
      mimeType: "application/pdf",
      buffer: original,
    });
    await expect(
      page.getByText("Original PDF view ready", { exact: false }),
    ).toBeVisible();
    await expect(page.locator(".advanced-ai-details")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(
      page.getByLabel("Automatic reading-image budget"),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Auto-Generate Detail Views",
        exact: true,
      }),
    ).not.toBeVisible();
    const viewer = page.getByLabel("Interactive original PDF");
    await expect(viewer).toBeVisible();
    await viewer.dblclick({ position: { x: 100, y: 100 } });
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    await page.getByRole("button", { name: "Fit sheet", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByLabel("Drawing page 2")).toBeVisible();
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    await page
      .getByRole("button", { name: "Rotate right", exact: true })
      .click();
    await expect(page.getByLabel("Viewer rotation")).toHaveText("90°");
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    await page
      .getByRole("button", { name: "Select drawing region", exact: true })
      .click();
    await viewer.scrollIntoViewIfNeeded();
    const box = (await viewer.boundingBox())!;
    await page.mouse.move(box.x + 25, box.y + 25);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(box.width - 20, 200), box.y + 180, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(
      page.getByLabel("Selected drawing region", { exact: true }),
    ).toBeVisible();
    const selected = await page
      .getByLabel("Selected drawing region", { exact: true })
      .evaluate((node) => ({
        x: parseFloat((node as HTMLElement).style.left),
        y: parseFloat((node as HTMLElement).style.top),
        width: parseFloat((node as HTMLElement).style.width),
        height: parseFloat((node as HTMLElement).style.height),
        scale: Number(
          document
            .querySelector(".pdf-scroll-viewport")!
            .getAttribute("data-viewer-scale"),
        ),
      }));
    await page
      .getByRole("button", { name: "Inspect selected region", exact: true })
      .click();
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    await page
      .getByRole("button", {
        name: "Prepare selected region for analysis",
        exact: true,
      })
      .click();
    await expect(
      page.getByText(/Region prepared from the original PDF/),
    ).toBeVisible();
    await expect(page.locator(".advanced-ai-details")).not.toHaveAttribute(
      "open",
      "",
    );
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    expect(Buffer.from(sent[0].data.split(",")[1], "base64")).toEqual(original);
    const manual = sent[0].detailRegions!.find(
      (r) => r.page === 2 && r.rotation === 90,
    );
    expect(manual).toBeDefined();
    expect(manual!.dpi).toBe(250);
    expect(manual!.x).toBeCloseTo(selected.x / selected.scale, 3);
    expect(manual!.y).toBeCloseTo(selected.y / selected.scale, 3);
    expect(manual!.width).toBeCloseTo(selected.width / selected.scale, 3);
    expect(manual!.height).toBeCloseTo(selected.height / selected.scale, 3);
    expect(manual!.pixelWidth).toBeGreaterThan(200);
    await expect(page.locator(".submitted-ai-details")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(
      page.getByRole("button", { name: /View AI Detail Images/ }),
    ).not.toBeVisible();
    await expect(viewer).toBeVisible();
    await viewer.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/original-plan-workspace-${width}.png`,
    });
    await page.locator(".submitted-ai-details > summary").click();
    await expect(
      page.getByRole("button", { name: /View AI Detail Images/ }),
    ).toBeVisible();
  });
}
