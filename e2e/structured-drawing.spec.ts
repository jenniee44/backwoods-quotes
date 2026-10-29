import { test, expect } from "@playwright/test";
import { structuredTakeoffFixture } from "../src/structuredTakeoff.fixture";
import { constructionPdf } from "./fixtures/constructionPdf";
import { readFile } from "node:fs/promises";
import { storageKey } from "../src/model";
for (const [width, rotation] of [
  [1366, 90],
  [390, 270],
] as const)
  test(`rotated original PDF preserves structured dimensions, proposals and contractor scope at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const original = Buffer.from(
      constructionPdf({
        rotation,
        notes: [
          "JOIST LAYOUT J1 WIDTH PERPENDICULAR TO JOISTS 16 ft",
          '2x6 PT @ 16" O/C',
          "H1 CONNECTION COUNT 13 CONNECTIONS; ONE LUS26 PER CONNECTION",
          "24'-3\" OVERALL",
          "DO NOT SCALE DRAWINGS",
        ],
      }),
    );
    let submitted = "",
      calls = 0;
    await page.route("**/api/plan-analysis", async (route) => {
      calls++;
      const docs = route.request().postDataJSON().documents;
      submitted = docs[0].data;
      const r = structuredTakeoffFixture();
      for (const item of [
        ...r.suggestions,
        ...(r.dimensions ?? []),
        ...(r.sourceObservations ?? []),
      ])
        item.documentId = docs[0].id;
      for (const item of r.dimensions ?? [])
        for (const dimension of item.drawingDimensions ?? [])
          dimension.orientation = rotation;
      const rail = {
        ...r.suggestions[0],
        assemblyReference: "R1",
        description: "Pressure-treated railings by others",
        specification: "PT wood railings",
        destination: "Informational" as const,
        itemRole: "Document observation" as const,
        notes: "Drawing note: railings by others",
        sourceFacts: ["Railings by others"],
        materialInputs: [],
        drawingDimensions: [],
        unit: "linear ft",
      };
      // Stored only as a source observation: the normal purchasing list must not price it.
      r.sourceObservations = [rail];
      await route.fulfill({ json: r });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Create New Quote" }).click();
    await page.getByLabel("Customer name *").fill("Synthetic contractor");
    await page.getByLabel("Job name *").fill("Synthetic structured deck");
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
      name: "Synthetic-rotated.pdf",
      mimeType: "application/pdf",
      buffer: original,
    });
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible({ timeout: 45000 });
    expect(submitted).toBe(
      "data:application/pdf;base64," + original.toString("base64"),
    );
    const summary = page.getByRole("region", {
      name: "Material Takeoff Summary",
      exact: true,
    });
    await expect(summary).toContainText("13 joists");
    await expect(summary).toContainText("13 each");
    await expect(
      page.getByRole("button", { name: /Final Shopping List/ }),
    ).toContainText("(0)");
    await page
      .getByText("Contractor scope — include, exclude or subcontract", {
        exact: true,
      })
      .click();
    const scope = page
      .locator(".scope-review-row")
      .filter({ hasText: "Pressure-treated railings by others" });
    await expect(scope).toHaveCount(1);
    await scope.getByRole("combobox").selectOption("Included");
    await scope.getByRole("button", { name: /Apply scope/ }).click();
    await expect(scope).toContainText("Contractor confirmed: Included");
    await page.getByRole("button", { name: "Save quote", exact: true }).click();
    await page
      .getByText("Export saved takeoff analysis", { exact: true })
      .click();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download private analysis JSON" })
      .click();
    const download = await downloadEvent;
    const exported = JSON.parse(
      await readFile((await download.path())!, "utf8"),
    );
    expect(
      exported.reports
        .at(-1)
        .dimensionDecisions.some(
          (d: { status: string }) => d.status === "Assigned",
        ),
    ).toBe(true);
    const rail = exported.materials.find(
      (t: { assemblyReference: string }) => t.assemblyReference === "R1",
    );
    expect(rail).toMatchObject({
      scopeOverride: "Included",
      status: "Proposed",
      quantity: null,
    });
    expect(rail.notes).toContain("by others");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic structured deck/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      storageKey,
    );
    const q = stored.quotes.find(
      (q: { name: string }) => q.name === "Synthetic structured deck",
    );
    expect(
      q.takeoff.find(
        (t: { assemblyReference: string }) => t.assemblyReference === "R1",
      ).scopeOverride,
    ).toBe("Included");
    expect(q.lines).toHaveLength(0);
    expect(calls).toBe(1);
  });
