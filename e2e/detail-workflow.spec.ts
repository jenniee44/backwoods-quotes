import { test, expect } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
async function attach(
  page: import("@playwright/test").Page,
  options: Parameters<typeof constructionPdf>[0] = {},
) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  const pdf = Buffer.from(constructionPdf(options));
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic-workflow.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.getByLabel("Drawing page 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Auto-Generate Detail Views", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /suggested views generated/ }),
  ).toBeVisible();
  return pdf;
}
for (const rotation of [90, 180, 270] as const)
  test(`auto details correct ${rotation} degree PDF metadata; original bytes and actual submitted images are preserved`, async ({
    page,
  }) => {
    const pdf = await attach(page, { rotation });
    const thumbnails = page.locator(".detail-thumbnail");
    const count = await thumbnails.count();
    expect(count).toBeGreaterThan(0);
    const box = page.getByLabel("Analysis package");
    await expect(box).toContainText(
      `${count} detail views selected for analysis`,
    );
    await expect(box).toContainText(`${count} prepared for submission`);
    await expect(
      page.getByRole("status").filter({ hasText: /suggested views generated/ }),
    ).toContainText("orientation(s) corrected");
    let requested = 0;
    await page.route("**/api/plan-analysis", async (route) => {
      const documents = route.request().postDataJSON().documents;
      const d = documents[0];
      expect(Buffer.from(d.data.split(",")[1], "base64")).toEqual(pdf);
      expect(d.detailRegions).toHaveLength(count);
      expect(
        d.detailRegions.every(
          (r: { rotation: number; dpi: number; data: string }) =>
            r.rotation === 0 &&
            r.dpi === 250 &&
            r.data.startsWith("data:image/"),
        ),
      ).toBe(true);
      requested += d.detailRegions.length;
      await route.fulfill({ json: analysisFixture(d.id) });
    });
    await page
      .getByLabel("I inspected all selected automatic detail views")
      .check();
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Submitted detail views:" }),
    ).toContainText(`${count} of ${count}`);
    expect(requested).toBe(count);
  });
test("blank drawings generate zero crops while scanned/vector content is proposed without OCR", async ({
  page,
}) => {
  await attach(page, { drawing: false, notes: [] });
  await expect(page.locator(".detail-thumbnail")).toHaveCount(0);
  await expect(page.getByLabel("Analysis package")).toContainText(
    "0 detail views selected for analysis",
  );
  await expect(
    page.getByRole("status").filter({ hasText: /suggested views generated/ }),
  ).toContainText("No additional readable content regions found");
  await attach(page, { notes: [] });
  expect(await page.locator(".detail-thumbnail").count()).toBeGreaterThan(0);
});
test("explicit view exclusion cannot silently submit an empty package; restoring selection sends every selected detail", async ({
  page,
}) => {
  const pdf = await attach(page);
  const count = await page.locator(".detail-thumbnail").count();
  await page
    .getByRole("checkbox", { name: "Include in analysis", exact: true })
    .uncheck();
  await expect(page.getByLabel("Analysis package")).toContainText(
    "0 detail views selected for analysis",
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "No detail views will be sent" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore detail selection", exact: true })
    .click();
  await expect(page.getByLabel("Analysis package")).toContainText(
    `${count} prepared for submission`,
  );
  const selection = page.getByRole("checkbox", {
    name: /Include detail .* in analysis/,
  });
  for (let i = 0; i < count; i++) await selection.nth(i).uncheck();
  await expect(
    page.getByRole("alert").filter({ hasText: "No detail views will be sent" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Analysis package")).toContainText(
    `0 detail views selected for analysis`,
  );
  await page
    .getByRole("button", { name: "Restore detail selection", exact: true })
    .click();
  await expect(page.getByLabel("Analysis package")).toContainText(
    `${count} prepared for submission`,
  );
  let sent = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    const d = route.request().postDataJSON().documents[0];
    sent += d.detailRegions.length;
    expect(Buffer.from(d.data.split(",")[1], "base64")).toEqual(pdf);
    await route.fulfill({ json: analysisFixture(d.id) });
  });
  await page
    .getByLabel("I inspected all selected automatic detail views")
    .check();
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  expect(sent).toBe(count);
});
test("visual crop, optional rounded controls, rename and original-operator rotation remain inspectable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await attach(page);
  await page.locator(".detail-thumbnail-button").first().click();
  const editor = page.locator(".detail-inspector[open]");
  await expect(editor.getByLabel("Left edge (%)")).not.toBeVisible();
  const map = editor.getByLabel("Select detail crop on original sheet");
  await expect
    .poll(() =>
      map.locator("canvas").evaluate((n) => (n as HTMLCanvasElement).width),
    )
    .toBe(600);
  await map.scrollIntoViewIfNeeded();
  const b = (await map.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.1, b.y + b.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.2);
  await page.mouse.up();
  await expect(editor).toContainText("Selected region: 259, 173");
  await editor.getByLabel("Detail name").fill("Pending visual crop");
  await expect(editor).toContainText("Selected region: 259, 173");
  await editor.getByRole("button", { name: "Apply region adjustment" }).click();
  await expect(
    page.getByLabel("I inspected all selected automatic detail views"),
  ).toBeEnabled();
  await editor.getByLabel("Detail name").fill("Verified rear-deck crop");
  await editor
    .getByRole("button", { name: "Rotate detail right", exact: true })
    .click();
  await expect(editor).toContainText("90°");
  await editor
    .getByRole("button", { name: "Rotate detail left", exact: true })
    .click();
  await expect(editor).toContainText("0°");
  await editor.getByText("Advanced region controls", { exact: true }).click();
  await expect(editor.getByLabel("Left edge (%)")).toBeVisible();
  await expect(editor.getByLabel("Detail name")).toHaveValue(
    "Verified rear-deck crop",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const textRotation of [90, 180, 270] as const)
  test(`sideways embedded text at ${textRotation} degrees is detected and rendered upright for analysis`, async ({
    page,
  }) => {
    const pdf = await attach(page, { textRotation });
    let sent = 0;
    await page.route("**/api/plan-analysis", async (route) => {
      const d = route.request().postDataJSON().documents[0];
      expect(Buffer.from(d.data.split(",")[1], "base64")).toEqual(pdf);
      expect(
        d.detailRegions.some(
          (r: { rotation: number }) => r.rotation === textRotation,
        ),
      ).toBe(true);
      const r = d.detailRegions[0];
      const regenerated = await page.evaluate(
        async ({ data, region }) => {
          const path = "/src/pdfSource.ts";
          const { loadPdfSource, renderPdfDetail } = await import(
            /* @vite-ignore */ path
          );
          const task = await loadPdfSource(data);
          try {
            const source = await task.promise;
            return (
              await renderPdfDetail(
                await source.getPage(region.page),
                region,
                region.rotation,
              )
            ).data;
          } finally {
            await task.destroy();
          }
        },
        { data: d.data, region: r },
      );
      expect(regenerated).toBe(r.data);
      sent += d.detailRegions.length;
      await route.fulfill({ json: analysisFixture(d.id) });
    });
    await page
      .getByLabel("I inspected all selected automatic detail views")
      .check();
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible();
    expect(sent).toBeGreaterThan(0);
  });
test("original-only analysis requires an explicit choice when existing previews are excluded", async ({
  page,
}) => {
  await attach(page);
  const views = page.getByRole("checkbox", {
    name: /Include detail .* in analysis/,
  });
  for (let i = 0; i < (await views.count()); i++) await views.nth(i).uncheck();
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Use selected originals only", exact: true })
    .click();
  let requests = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    const d = route.request().postDataJSON().documents[0];
    expect(d.detailRegions ?? []).toHaveLength(0);
    requests++;
    await route.fulfill({ json: analysisFixture(d.id) });
  });
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await expect(
    page.getByRole("status").filter({ hasText: "Submitted detail views:" }),
  ).toContainText("0 of 0");
});
test("a preparation fault cannot silently discard selected detail images; rebuild retries safely", async ({
  page,
}) => {
  await page.route("**/src/optimizeAnalysisPackage.ts", async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    expect(body).toContain("return result;");
    body =
      "let injectedDetailFault = false;\n" +
      body.replaceAll(
        "return result;",
        "{ if (!injectedDetailFault && result.some(d => (d.detailRegions ?? []).length)) { injectedDetailFault = true; return result.map(d => ({...d, detailRegions: []})); } return result; }",
      );
    await route.fulfill({ response, body });
  });
  await attach(page);
  let requests = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    requests++;
    const d = route.request().postDataJSON().documents[0];
    expect(d.detailRegions.length).toBeGreaterThan(0);
    await route.fulfill({ json: analysisFixture(d.id) });
  });
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Selected detail views are missing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeDisabled();
  expect(requests).toBe(0);
  await page
    .getByRole("button", { name: "Rebuild analysis package", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Selected detail views are missing" }),
  ).toHaveCount(0);
  await page
    .getByLabel("I inspected all selected automatic detail views")
    .check();
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  expect(requests).toBe(1);
});

test("slow orientation preparation never reports ready or allows ignored zoom controls", async ({
  page,
}) => {
  await page.route("**/src/PdfPreview.tsx", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    expect(body).toContain("p.getTextContent()");
    await route.fulfill({
      response,
      body: body.replace(
        "p.getTextContent()",
        "new Promise(resolve => setTimeout(resolve, 1200)).then(() => p.getTextContent())",
      ),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic-delayed-orientation.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(constructionPdf({ rotation: 180 })),
  });
  await expect(
    page.getByText(/Preparing original PDF orientation/),
  ).toBeVisible();
  await expect(page.getByLabel("Zoom drawing")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText(/Original PDF view ready/)).not.toBeVisible();
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
  await page.getByLabel("Zoom drawing").selectOption("1");
  await expect(page.locator(".pdf-scroll-viewport")).toHaveAttribute(
    "data-viewer-scale",
    "1",
  );
  await expect(page.locator(".pdf-page-surface")).toHaveCSS("width", "2592px");
});

test("mixed-orientation details fit comfortably, support reading and manual rotation, and submit only included preview images", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const original = await attach(page, {
    notes: [],
    drawing: false,
    mixedNotes: true,
    rotation: 180,
  });
  const thumbs = page.locator(".detail-thumbnail");
  await expect(thumbs).toHaveCount(4);
  await expect(page.getByLabel("Analysis package")).toContainText(
    "4 prepared for submission",
  );
  const cards = page.locator(".detail-review-item");
  const previewData = await thumbs.evaluateAll((images) =>
    images.map((image) => (image as HTMLImageElement).src),
  );
  for (const angle of [0, 90, 180, 270])
    await expect(
      cards.filter({ hasText: `Page 1 · ${angle}°` }).first(),
    ).toBeVisible();
  await page.locator(".detail-thumbnail-button").first().click();
  const editor = page.locator(".detail-inspector[open]");
  const image = editor.locator(".detail-image-scroll img");
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((el) => el.getBoundingClientRect().top),
  ).toBeLessThan(
    await editor
      .getByLabel("Select detail crop on original sheet")
      .evaluate((el) => el.getBoundingClientRect().top),
  );
  expect(
    await image.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(421);
  await editor
    .getByRole("button", { name: "Read small text (100%)", exact: true })
    .click();
  await expect(editor.getByLabel(/Detail preview zoom/)).toHaveValue("100");
  await editor.getByLabel(/Detail preview zoom/).fill("150");
  const pan = editor.locator(".detail-image-scroll");
  await pan.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = await pan.boundingBox();
  expect(
    await pan.evaluate(
      (el) =>
        el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
    ),
  ).toBe(true);
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 - 80,
    box!.y + box!.height / 2 - 80,
  );
  await page.mouse.up();
  expect(
    await pan.evaluate((el) => el.scrollLeft + el.scrollTop),
  ).toBeGreaterThan(0);
  await editor.getByRole("button", { name: "Fit detail", exact: true }).click();
  await expect(image).toBeVisible();
  await editor
    .getByRole("button", { name: "Rotate detail right", exact: true })
    .click();
  await expect(
    page.getByLabel("I inspected all selected automatic detail views"),
  ).toBeEnabled();
  await page.getByLabel("Detail review group").selectOption({ index: 2 });
  expect(await cards.filter({ visible: true }).count()).toBeLessThan(4);
  await expect(page.getByLabel("Analysis package")).toContainText(
    "4 detail views selected",
  );
  await page.getByLabel("Detail review group").selectOption("All details");
  await page
    .getByRole("checkbox", { name: /Include detail .* in analysis/ })
    .last()
    .uncheck();
  const included = await thumbs.evaluateAll((images) =>
    images.slice(0, 3).map((image) => (image as HTMLImageElement).src),
  );
  expect(included.slice(1)).toEqual(previewData.slice(1, 3));
  let sent = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    const d = route.request().postDataJSON().documents[0];
    expect(Buffer.from(d.data.split(",")[1], "base64")).toEqual(original);
    expect(d.pdfText.pages[0].text).toContain("CONNECTION NOTES");
    expect(d.detailRegions).toHaveLength(3);
    expect(d.detailRegions.map((r: { data: string }) => r.data)).toEqual(
      included,
    );
    const rotations = await cards.evaluateAll((elements) =>
      elements
        .slice(0, 3)
        .map((el) =>
          Number(
            el
              .querySelector(".detail-thumbnail-button")
              ?.textContent?.match(/· (\d+)°/)?.[1],
          ),
        ),
    );
    expect(
      d.detailRegions.map((r: { rotation: number }) => r.rotation),
    ).toEqual(rotations);
    const exactOriginalRender = await page.evaluate(
      async ({ data, region }) => {
        const path = "/src/pdfSource.ts";
        const { loadPdfSource, renderPdfDetail } = await import(
          /* @vite-ignore */ path
        );
        const task = await loadPdfSource(data);
        try {
          const pdf = await task.promise;
          return (
            await renderPdfDetail(
              await pdf.getPage(region.page),
              region,
              region.rotation,
            )
          ).data;
        } finally {
          await task.destroy();
        }
      },
      { data: d.data, region: d.detailRegions[0] },
    );
    expect(exactOriginalRender).toBe(d.detailRegions[0].data);
    sent += d.detailRegions.length;
    await route.fulfill({ json: analysisFixture(d.id) });
  });
  await page
    .getByLabel("I inspected all selected automatic detail views")
    .check();
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible();
  expect(sent).toBe(3);
});

test("scanned orientation is flagged and the attention filter never silently excludes selected views", async ({
  page,
}) => {
  await attach(page, { notes: [], drawing: true, rotation: 180 });
  const count = await page.locator(".detail-thumbnail").count();
  expect(count).toBeGreaterThan(0);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "views need rotation or crop attention" }),
  ).toContainText(`${count} views`);
  await page.getByLabel("Detail review group").selectOption("Needs attention");
  await expect(page.locator(".detail-review-item:visible")).toHaveCount(count);
  await expect(page.getByLabel("Analysis package")).toContainText(
    `${count} detail views selected`,
  );
  await page.locator(".detail-thumbnail-button").first().click();
  await page
    .locator(".detail-inspector[open]")
    .getByRole("button", { name: "Rotate detail right", exact: true })
    .click();
  await expect(page.locator(".detail-review-item:visible")).toHaveCount(
    count - 1,
  );
  await expect(page.getByLabel("Analysis package")).toContainText(
    `${count} detail views selected`,
  );
  await page.getByLabel("Detail review group").selectOption("All details");
  await expect(page.locator(".detail-thumbnail")).toHaveCount(count);
  await expect(
    page.getByLabel("I inspected all selected automatic detail views"),
  ).toBeEnabled();
});
