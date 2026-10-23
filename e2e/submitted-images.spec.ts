import { test, expect, type Page } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
import { storageKey } from "../src/model";
import type { AnalysisDocument } from "../shared/analysis";
async function analyze(
  page: Page,
  name: string,
  options: Parameters<typeof constructionPdf>[0] = { pages: 2, rotation: 180 },
  budget = 8,
) {
  let requests = 0;
  let sent: AnalysisDocument[] = [];
  const original = Buffer.from(constructionPdf(options), "ascii");
  await page.route("**/api/plan-analysis", async (route) => {
    requests++;
    sent = route.request().postDataJSON().documents;
    const r = analysisFixture(sent[0].id),
      beams = syntheticDeckBeams();
    beams[1].dimensions.push(fullDimension(beams[1], "14'-6\""));
    r.suggestions = [
      {
        ...r.suggestions[1],
        description: "3PLY 2X10 PT beam members",
        specification: "3PLY 2X10 PT",
        category: "Framing",
        quantity: null,
        unit: "boards",
        notes: "New work",
        location: "Deck A",
        sourceFacts: [
          "Three spatially identified beam lines; repeated labels refer to these same physical assemblies",
        ],
        beamAssemblies: [...beams, structuredClone(beams[0])],
      },
    ];
    r.dimensions = [];
    r.sourceObservations = [];
    await route.fulfill({ json: r });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Synthetic image regression");
  await page.getByLabel("Job name *").fill(name);
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
  if (budget !== 8) {
    await page.getByText("Advanced Settings", { exact: true }).click();
    await page
      .getByLabel("Automatic reading-image budget")
      .selectOption(String(budget));
  }
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(
    page.getByText("Analysis complete — needs review", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.locator(".submitted-ai-details > summary").click();
  return {
    get sent() {
      return sent;
    },
    get requests() {
      return requests;
    },
    original,
  };
}
for (const width of [1366, 390])
  test(`actual submitted images stay identical, private and inspectable after reopening at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    const name = `Synthetic saved images ${width}`,
      result = await analyze(page, name);
    const images = result.sent.flatMap((d) => d.detailRegions ?? []);
    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThanOrEqual(8);
    expect(Buffer.from(result.sent[0].data.split(",")[1], "base64")).toEqual(
      result.original,
    );
    expect(images.every((i) => i.sourcePageRotation === 180)).toBe(true);
    expect(images.some((i) => i.rotation === 0)).toBe(true);
    const button = page.getByRole("button", {
      name: `View AI Detail Images (${images.length})`,
      exact: true,
    });
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(
      page.getByRole("button", {
        name: "Auto-Generate Detail Views",
        exact: true,
      }),
    ).not.toBeVisible();
    await button.click();
    const thumbnails = page.locator(".submitted-image-grid img");
    await expect(thumbnails).toHaveCount(images.length);
    for (let i = 0; i < images.length; i++)
      await expect(thumbnails.nth(i)).toHaveAttribute("src", images[i].data);
    await page
      .getByRole("button", { name: "Inspect submitted image 1", exact: true })
      .click();
    await expect(
      page.getByAltText("Exact submitted detail enlarged"),
    ).toHaveAttribute("src", images[0].data);
    await page
      .getByRole("button", { name: "Zoom in submitted image", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Submitted image inspection" }),
    ).toContainText("125%");
    await expect(
      page.getByLabel("Submitted crop location on original page"),
    ).toBeVisible();
    await page
      .getByLabel("Flag incorrect / unreadable image 1", { exact: true })
      .check();
    await expect(page.getByText("Review flag saved privately.")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).quotes.some(
              (q: { name: string; analysisReports?: unknown[] }) =>
                q.name === `Synthetic saved images ${innerWidth}` &&
                !!q.analysisReports?.length,
            ),
          storageKey,
        ),
      )
      .toBe(true);
    await page.reload();
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page.locator(".submitted-ai-details").evaluateAll((nodes) =>
      nodes.forEach((node) => {
        (node as HTMLDetailsElement).open = true;
      }),
    );
    await page
      .getByRole("button", {
        name: `View AI Detail Images (${images.length})`,
        exact: true,
      })
      .click();
    await expect(page.locator(".submitted-image-grid img")).toHaveCount(
      images.length,
    );
    for (let i = 0; i < images.length; i++)
      await expect(
        page.locator(".submitted-image-grid img").nth(i),
      ).toHaveAttribute("src", images[i].data);
    await expect(
      page.getByLabel("Flag incorrect / unreadable image 1", { exact: true }),
    ).toBeChecked();
    await page
      .getByRole("button", { name: "Inspect submitted image 1", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Prepare corrected / additional view for future analysis",
        exact: true,
      })
      .click();
    await page.locator(".advanced-ai-details > summary").click();
    const correction = page.locator(".submitted-inspector .detail-view-card");
    await correction.locator(".detail-thumbnail-button").click();
    await correction
      .getByRole("button", { name: "Rotate detail right", exact: true })
      .click();
    await expect(page.locator(".pdf-detail-list")).toContainText("250 DPI");
    await expect(
      page.locator(".pdf-detail-list .detail-thumbnail"),
    ).toHaveCount(images.length);
    await expect(
      page.getByAltText("Exact submitted detail enlarged"),
    ).toHaveAttribute("src", images[0].data);
    expect(result.requests).toBe(1);
    await page
      .getByRole("button", { name: /Preliminary Shopping List/ })
      .click();
    await page
      .locator(".preliminary-materials")
      .getByRole("button", { name: "Review details", exact: true })
      .click();
    await expect(
      page.getByLabel("Material calculator", { exact: true }),
    ).toHaveValue("beam-runs");
    await expect(
      page.getByLabel("Number of separate beam runs", { exact: true }),
    ).toHaveValue("3");
    const beam1 = page.getByRole("region", { name: "Beam 1", exact: true });
    await expect(
      beam1.getByLabel("Number of plies", { exact: true }),
    ).toHaveValue("3");
    await expect(
      beam1.getByLabel("Beam length — feet", { exact: true }),
    ).toHaveValue("");
  });
test("unavailable private image storage is explicit, keeps quote data safe and never recreates submitted images on reopen", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: {
        open() {
          throw new Error("Synthetic quota/unavailable");
        },
      },
    }),
  );
  const r = await analyze(page, "Synthetic quota images", {
    drawing: true,
    notes: [],
    pages: 1,
    pageDrawing: ["1 w 600 500 400 300 re S"],
  });
  const n = r.sent[0].detailRegions!.length;
  expect(n).toBeGreaterThan(0);
  await expect(
    page.getByText(/Images are available for this session only/).first(),
  ).toBeVisible();
  await page.locator(".submitted-ai-details").evaluateAll((nodes) =>
    nodes.forEach((node) => {
      (node as HTMLDetailsElement).open = true;
    }),
  );
  await page
    .getByRole("button", { name: `View AI Detail Images (${n})`, exact: true })
    .click();
  await expect(page.locator(".submitted-image-grid img")).toHaveCount(n);
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).quotes.some(
            (q: { name: string; analysisReports?: unknown[] }) =>
              q.name === "Synthetic quota images" &&
              !!q.analysisReports?.length,
          ),
        storageKey,
      ),
    )
    .toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /Synthetic quota images/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.locator(".submitted-ai-details").evaluateAll((nodes) =>
    nodes.forEach((node) => {
      (node as HTMLDetailsElement).open = true;
    }),
  );
  await page
    .getByRole("button", { name: `View AI Detail Images (${n})`, exact: true })
    .click();
  await expect(
    page.getByText(/Submitted images are no longer available on this device/),
  ).toBeVisible();
  expect(r.requests).toBe(1);
});
test("deleting one quote removes its private image archive without deleting another archive", async ({
  page,
}) => {
  const r = await analyze(page, "Synthetic archive deletion", { pages: 1 });
  expect(r.sent[0].detailRegions!.length).toBeGreaterThan(0);
  const quoteId = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).quotes.find(
        (q: { name: string }) => q.name === "Synthetic archive deletion",
      )?.id,
    storageKey,
  );
  expect(quoteId).toBeTruthy();
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("backwoods-private-analysis-images", 1);
        req.onsuccess = () => {
          const db = req.result,
            tx = db.transaction("archives", "readwrite");
          tx.objectStore("archives").put({
            key: "unrelated:report",
            quoteId: "unrelated",
            images: [],
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete quote", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          new Promise<boolean>((resolve, reject) => {
            const req = indexedDB.open("backwoods-private-analysis-images", 1);
            req.onsuccess = () => {
              const db = req.result,
                tx = db.transaction("archives", "readonly"),
                read = tx.objectStore("archives").getAll();
              read.onsuccess = () => {
                const rows = read.result;
                db.close();
                resolve(
                  !rows.some((a: { quoteId: string }) => a.quoteId === id) &&
                    rows.some(
                      (a: { quoteId: string }) => a.quoteId === "unrelated",
                    ),
                );
              };
              read.onerror = () => reject(read.error);
            };
          }),
        quoteId,
      ),
    )
    .toBe(true);
});
test("reading budget is explicit and bounded while viewing previous images never requests AI", async ({
  page,
}) => {
  test.setTimeout(90000);
  const r = await analyze(page, "Synthetic reading budget", { pages: 12 }, 12);
  expect(r.sent[0].detailRegions).toHaveLength(12);
  expect(r.requests).toBe(1);
  await page
    .getByRole("button", { name: "View AI Detail Images (12)", exact: true })
    .click();
  await expect(page.locator(".submitted-image-grid img")).toHaveCount(12);
  expect(r.requests).toBe(1);
  await page.getByLabel("Automatic reading-image budget").selectOption("4");
  expect(r.requests).toBe(1);
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  await expect(page.getByLabel("Viewer rotation")).toHaveText("90°");
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  await expect(page.getByLabel("Viewer rotation")).toHaveText("180°");
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
  await page
    .getByRole("button", { name: "Analyze Plans", exact: true })
    .click();
  await expect(page.locator(".submitted-ai-details")).toHaveCount(2, {
    timeout: 60000,
  });
  await page.locator(".submitted-ai-details").evaluateAll((nodes) =>
    nodes.forEach((node) => {
      (node as HTMLDetailsElement).open = true;
    }),
  );
  await expect(
    page.getByRole("button", {
      name: "View AI Detail Images (4)",
      exact: true,
    }),
  ).toBeVisible({ timeout: 60000 });
  expect(r.sent[0].detailRegions).toHaveLength(4);
  expect(r.sent[0].detailRegions!.find((r) => r.page === 1)?.rotation).toBe(
    180,
  );
  expect(r.requests).toBe(2);
  await expect(
    page.getByRole("button", {
      name: "View AI Detail Images (12)",
      exact: true,
    }),
  ).toBeVisible();
});
