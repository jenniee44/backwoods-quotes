import { test, expect } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
test("automatic 250 DPI suggestions are inspected, editable, deduplicated, private and sent with unchanged original", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Synthetic automatic details");
  await page.getByLabel("Job name *").fill("Auto detail test");
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  const pdf = Buffer.from(constructionPdf());
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic.pdf",
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
  const views = page.locator(".detail-inspector");
  await expect(views).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Analyze Plans", exact: true }),
  ).toBeDisabled();
  await views.first().locator(":scope > summary").click();
  await expect(views.locator(".detail-image-scroll img")).toBeVisible();
  await views.getByLabel("Detail name").fill("Foundation notes close-up");
  await views.getByLabel("Detail preview zoom (%)").fill("50");
  await views.getByText("Advanced region controls", { exact: true }).click();
  await views.getByLabel("Left edge (%)").fill("1");
  await views.getByRole("button", { name: "Apply region adjustment" }).click();
  await expect(views.first()).toContainText("Selected region: 26");
  await page
    .getByRole("button", { name: "Auto-Generate Detail Views", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /0 suggested views generated/ }),
  ).toBeVisible();
  await expect(views).toHaveCount(1);
  let requests = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    requests++;
    const d = route.request().postDataJSON().documents[0];
    expect(Buffer.from(d.data.split(",")[1], "base64")).toEqual(pdf);
    expect(d.detailRegions[0].dpi).toBe(250);
    expect(d.detailRegions[0].label).toBe("Foundation notes close-up");
    expect(d.detailRegions[0].x).toBeCloseTo(25.92);
    expect(d.pdfText.pages[0].text).toContain("JOISTS");
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
  expect(requests).toBe(1);
  await page
    .getByRole("button", { name: "Customer quote", exact: true })
    .click();
  await expect(page.locator(".customer-document")).not.toContainText(
    /Foundation notes close-up|PRIVATE_PLAN_TEXT_ONLY|250 DPI/,
  );
});

test("scanned drawings receive honest coverage suggestions; deleting views preserves manual capture and original source", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  const pdf = Buffer.from(
    constructionPdf({ width: 612, height: 792, notes: [] }),
  );
  await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
    name: "synthetic-scan-like.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.getByLabel("Drawing page 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Auto-Generate Detail Views", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /visible-content suggestions/ }),
  ).toBeVisible();
  const count = await page.locator(".detail-inspector").count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(20);
  await expect(
    page.locator(".detail-inspector").first().locator(":scope > summary"),
  ).toContainText("inspect manually");
  await page
    .getByRole("button", { name: "Remove detail view 1", exact: true })
    .first()
    .click();
  await expect(page.locator(".detail-inspector")).toHaveCount(count - 1);
  await page
    .getByRole("button", {
      name: "Include this view in analysis (250 DPI)",
      exact: true,
    })
    .click();
  await expect(page.locator(".detail-inspector")).toHaveCount(count);
  await expect(
    page.getByRole("link", {
      name: "Download synthetic-scan-like.pdf",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("automatic overlap suppression stays scoped to the source PDF", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  for (const name of ["first-synthetic.pdf", "second-synthetic.pdf"]) {
    await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
      name,
      mimeType: "application/pdf",
      buffer: Buffer.from(constructionPdf()),
    });
    await expect(
      page.getByRole("link", { name: `Download ${name}`, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Auto-Generate Detail Views", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: /suggested views generated/ }),
    ).toBeVisible();
  }
  await expect(page.locator(".detail-inspector")).toHaveCount(2);
  await expect(page.locator(".pdf-detail-list")).toContainText(
    "first-synthetic.pdf",
  );
  await expect(page.locator(".pdf-detail-list")).toContainText(
    "second-synthetic.pdf",
  );
});
