import { test, expect, type Page } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
import type { PdfDetailRegion } from "../shared/pdf";

test.use({ viewport: { width: 1280, height: 900 } });

async function openDrawing(page: Page) {
  const original = Buffer.from(constructionPdf({ pages: 2 }), "ascii");
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Synthetic navigation test");
  await page.getByLabel("Job name *").fill("Drawing navigation fixture");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "navigation-fixture.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  await ready(page);
  return original;
}
async function ready(page: Page) {
  await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
}
async function view(page: Page) {
  return page.locator(".pdf-scroll-viewport").evaluate((node) => ({
    scale: Number((node as HTMLElement).dataset.viewerScale),
    left: node.scrollLeft,
    top: node.scrollTop,
    width: node.clientWidth,
    height: node.clientHeight,
    pageScale: window.visualViewport?.scale ?? 1,
  }));
}
async function zoomWheel(
  page: Page,
  key: "ctrlKey" | "metaKey",
  deltaY: number,
  x = 80,
  y = 100,
) {
  return page.locator(".pdf-scroll-viewport").evaluate(
    (node, args) => {
      const bounds = node.getBoundingClientRect();
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        [args.key]: true,
        deltaY: args.deltaY,
        clientX: bounds.left + node.clientLeft + args.x,
        clientY: bounds.top + node.clientTop + args.y,
      });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { key, deltaY, x, y },
  );
}

test("Ctrl/trackpad and Cmd wheel zoom only the drawing around the pointer, with limits and existing controls", async ({
  page,
}) => {
  await openDrawing(page);
  await page.getByLabel("Zoom drawing").selectOption("1");
  await ready(page);
  await page
    .locator(".pdf-scroll-viewport")
    .evaluate((node) => node.scrollTo(350, 220));
  await expect(page.locator(".pdf-canvas")).toHaveCSS("left", "350px");
  const before = await view(page);
  expect(await zoomWheel(page, "ctrlKey", -30)).toBe(true);
  await expect.poll(async () => (await view(page)).scale).toBeGreaterThan(1);
  await ready(page);
  const after = await view(page);
  expect((after.left + 80) / after.scale).toBeCloseTo(
    (before.left + 80) / before.scale,
    0,
  );
  expect((after.top + 100) / after.scale).toBeCloseTo(
    (before.top + 100) / before.scale,
    0,
  );
  expect(after.pageScale).toBe(before.pageScale);
  expect(await zoomWheel(page, "metaKey", -30)).toBe(true);
  await expect
    .poll(async () => (await view(page)).scale)
    .toBeGreaterThan(after.scale);
  await ready(page);
  const outside = await page
    .locator("h1")
    .first()
    .evaluate((node) => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -50,
      });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(outside).toBe(false);
  // A burst of events uses the latest zoom even before a paint, and stays bounded.
  await page.locator(".pdf-scroll-viewport").evaluate((node) => {
    for (let i = 0; i < 10; i++)
      node.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: -200,
        }),
      );
  });
  await expect(page.getByLabel("Zoom drawing")).toHaveValue("4");
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeDisabled();
  await page.locator(".pdf-scroll-viewport").evaluate((node) => {
    for (let i = 0; i < 10; i++)
      node.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY: 200,
        }),
      );
  });
  await ready(page);
  const minimum = await view(page);
  expect(minimum.scale).toBeCloseTo(Math.min(0.25, minimum.width / 2592), 6);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect
    .poll(async () => (await view(page)).scale)
    .toBeGreaterThan(minimum.scale);
  await ready(page);
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  await expect(page.getByLabel("Viewer rotation")).toHaveText("90°");
  await ready(page);
  await page.getByRole("button", { name: "Fit sheet", exact: true }).click();
  await expect(page.getByLabel("Zoom drawing")).toHaveValue("fit");
  await ready(page);
  expect((await view(page)).scale).toBeCloseTo(
    (await view(page)).width / 1728,
    6,
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Drawing page 2")).toBeVisible();
  await ready(page);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page.getByLabel("Viewer rotation")).toHaveText("90°");
});

test("unmodified wheel pans natively and page scrolling continues outside and at drawing edges", async ({
  page,
}) => {
  await openDrawing(page);
  await page.getByLabel("Zoom drawing").selectOption("2");
  await ready(page);
  const viewport = page.locator(".pdf-scroll-viewport");
  await viewport.scrollIntoViewIfNeeded();
  const bounds = (await viewport.boundingBox())!;
  await page.mouse.move(bounds.x + 100, bounds.y + 100);
  const before = await view(page);
  const cancel = await viewport.evaluate((node) => {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 50,
    });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(cancel).toBe(false);
  await page.mouse.wheel(140, 220);
  await expect
    .poll(async () => (await view(page)).top)
    .toBeGreaterThan(before.top);
  await expect
    .poll(async () => (await view(page)).left)
    .toBeGreaterThan(before.left);
  expect((await view(page)).scale).toBe(2);
  await viewport.evaluate((node) => node.scrollTo(0, node.scrollHeight));
  await ready(page);
  const pageY = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(pageY);
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(10, 100);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});

test("Safari gesture events and two-finger touch zoom/pan preserve single-finger scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDrawing(page);
  await page.getByLabel("Zoom drawing").selectOption("1");
  await ready(page);
  const viewport = page.locator(".pdf-scroll-viewport");
  const canceled = await viewport.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const send = (name: string, scale: number) => {
      const event = new Event(name, { bubbles: true, cancelable: true });
      Object.assign(event, {
        scale,
        clientX: bounds.left + 100,
        clientY: bounds.top + 100,
      });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return [
      send("gesturestart", 1),
      send("gesturechange", 1.5),
      send("gestureend", 1.5),
    ];
  });
  expect(canceled).toEqual([true, true, true]);
  await expect(page.getByLabel("Zoom drawing")).toHaveValue("1.5");
  await ready(page);
  await viewport.evaluate((node) => node.scrollTo(400, 400));
  await expect(page.locator(".pdf-canvas")).toHaveCSS("top", "400px");
  const before = await view(page);
  const results = await viewport.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const send = (name: string, coordinates: number[][]) => {
      const touches = coordinates.map(
        ([x, y], identifier) =>
          new Touch({
            identifier,
            target: node,
            clientX: bounds.left + x,
            clientY: bounds.top + y,
          }),
      );
      const event = new TouchEvent(name, {
        bubbles: true,
        cancelable: true,
        touches,
      });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const single = send("touchstart", [[100, 100]]);
    const start = send("touchstart", [
      [100, 120],
      [200, 120],
    ]);
    const move = send("touchmove", [
      [75, 120],
      [225, 120],
    ]);
    return { single, start, move };
  });
  expect(results).toEqual({ single: false, start: true, move: true });
  await expect(page.getByLabel("Zoom drawing")).toHaveValue("2.25");
  await ready(page);
  const zoomed = await view(page);
  expect((zoomed.left + 150) / zoomed.scale).toBeCloseTo(
    (before.left + 150) / before.scale,
    0,
  );
  await viewport.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const touches = [85, 235].map(
      (x, identifier) =>
        new Touch({
          identifier,
          target: node,
          clientX: bounds.left + x,
          clientY: bounds.top + 120,
        }),
    );
    node.dispatchEvent(
      new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches }),
    );
  });
  await expect
    .poll(async () => (await view(page)).left)
    .toBeLessThan(zoomed.left - 5);
  expect((await view(page)).scale).toBe(2.25);
  await viewport.dispatchEvent("touchend", { touches: [] });
  await page.getByRole("button", { name: "Fit sheet", exact: true }).click();
  await expect(page.getByLabel("Zoom drawing")).toHaveValue("fit");
});

test("rotated gesture view captures exact 250 DPI original operators and retains unchanged native PDF analysis", async ({
  page,
}) => {
  const original = await openDrawing(page);
  let request:
    | {
        documents: {
          id: string;
          data: string;
          detailRegions: PdfDetailRegion[];
        }[];
      }
    | undefined;
  await page.route("**/api/plan-analysis", async (route) => {
    request = route.request().postDataJSON();
    await route.fulfill({ json: analysisFixture(request!.documents[0].id) });
  });
  await page.getByRole("button", { name: "Rotate right", exact: true }).click();
  await ready(page);
  await page.getByLabel("Zoom drawing").selectOption("2");
  await ready(page);
  await page
    .locator(".pdf-scroll-viewport")
    .evaluate((node) => node.scrollTo(400, 300));
  await expect(page.locator(".pdf-canvas")).toHaveCSS("left", "400px");
  await zoomWheel(page, "metaKey", -25);
  await expect.poll(async () => (await view(page)).scale).toBeGreaterThan(2);
  await ready(page);
  const visible = await view(page);
  // Deliberately poison the preview: the capture must still use original PDF operators.
  await page.getByLabel("Drawing page 1").evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  });
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
  const source = request!.documents[0];
  expect(Buffer.from(source.data.split(",")[1], "base64")).toEqual(original);
  const detail = source.detailRegions[0];
  expect(detail.rotation).toBe(90);
  expect(detail.dpi).toBe(250);
  expect(detail.x).toBeCloseTo(visible.left / visible.scale, 5);
  expect(detail.y).toBeCloseTo(visible.top / visible.scale, 5);
  expect(detail.width).toBeCloseTo(visible.width / visible.scale, 5);
  expect(detail.height).toBeCloseTo(visible.height / visible.scale, 5);
  const reference = await page.evaluate(
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
      const p = await doc.getPage(1);
      const canvas = document.createElement("canvas");
      canvas.width = region.pixelWidth;
      canvas.height = region.pixelHeight;
      const scale = 250 / 72;
      await p.render({
        canvas,
        canvasContext: canvas.getContext("2d")!,
        viewport: p.getViewport({ scale, rotation: region.rotation }),
        transform: [1, 0, 0, 1, -region.x * scale, -region.y * scale],
      }).promise;
      const png = canvas.toDataURL("image/png");
      await task.destroy();
      return png;
    },
    { data: source.data, region: detail },
  );
  expect(detail.data).toBe(reference);
});
