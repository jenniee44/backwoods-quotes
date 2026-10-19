import { expect, test } from "@playwright/test";
import { analysisFixture } from "../shared/analysis.fixture";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
import { constructionPdf } from "./fixtures/constructionPdf";
import { storageKey } from "../src/model";
for (const width of [1366, 390])
  test(`spatial S1.0 beam associations stay proposed, preserve original and separate overall dimensions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const linework = [0.3, 0.5, 0.7]
      .map((y) => {
        const py = 600 * (1 - y);
        return (
          `1 w 160 ${py} m 640 ${py} l S\n` +
          [240, 400, 560]
            .map(
              (x) =>
                `BT /F1 8 Tf 1 0 0 1 ${x} ${py + 6} Tm (3PLY 2X10 PT) Tj ET`,
            )
            .join("\n") +
          "\n" +
          [160, 320, 480, 640]
            .map((x) => `${x - 2} ${py - 2} 4 4 re S`)
            .join("\n")
        );
      })
      .join("\n");
    const dimension = (
      left: number,
      right: number,
      y: number,
      caption: string,
      target: number,
    ) => {
      const a = left * 800,
        z = right * 800,
        py = (1 - y) * 600,
        to = (1 - target) * 600;
      return `0.5 w ${a} ${py} m ${z} ${py} l S ${a} ${py + 3} m ${a} ${to} l S ${z} ${py + 3} m ${z} ${to} l S BT /F1 8 Tf 1 0 0 1 ${(a + z) / 2 - 20} ${py + 6} Tm (${caption}) Tj ET`;
    };
    const dimensions = [
      dimension(0.1, 0.9, 0.12, "24'-3\"", 0.18),
      dimension(0.2, 0.8, 0.22, "12'-0\"", 0.3),
      ...[0.3, 0.5, 0.7].map((y) => dimension(0.2, 0.4, y - 0.04, "8'-0\"", y)),
    ].join("\n");
    const referenceLines = [
      { y: 0.8, text: "EXISTING 3PLY 2X10 PT TO REMAIN" },
      { y: 0.9, text: "BY OTHERS 3PLY 2X10 PT" },
    ]
      .map(
        (r) =>
          `664 ${(1 - r.y) * 600} m 784 ${(1 - r.y) * 600} l S BT /F1 6 Tf 1 0 0 1 664 ${(1 - r.y) * 600 + 6} Tm (${r.text}) Tj ET`,
      )
      .join("\n");
    const original = Buffer.from(
      constructionPdf({
        width: 800,
        height: 600,
        drawing: false,
        notes: [
          "S1.0 Foundation & Deck Framing Plan",
          "Overall 24'-3\"",
          "DO NOT SCALE DRAWINGS",
        ],
        pageDrawing: [linework + "\n" + dimensions + "\n" + referenceLines],
      }),
      "ascii",
    );
    let submitted = false;
    await page.route("**/api/plan-analysis", async (route) => {
      const { documents } = route.request().postDataJSON();
      const d = documents[0];
      expect(Buffer.from(d.data.split(",")[1], "base64")).toEqual(original);
      expect(
        d.pdfText.pages[0].positions.filter(
          (p: { text: string }) => p.text === "3PLY 2X10 PT",
        ),
      ).toHaveLength(9);
      const r = analysisFixture(d.id),
        beams = syntheticDeckBeams();
      const full = fullDimension(beams[0]);
      full.start.y = 0.22;
      full.end.y = 0.22;
      beams[0].dimensions.push(full);
      const existing = structuredClone(beams[1]);
      existing.scope = "Existing work to remain";
      existing.drawingLabel = "Existing beam";
      existing.start = { x: 0.83, y: 0.8 };
      existing.end = { x: 0.98, y: 0.8 };
      existing.labels = [
        { text: "EXISTING 3PLY 2X10 PT TO REMAIN", point: { x: 0.9, y: 0.79 } },
      ];
      existing.supports = [];
      existing.dimensions = [];
      const others = structuredClone(beams[2]);
      others.scope = "By others / excluded";
      others.drawingLabel = "By others beam";
      others.start = { x: 0.83, y: 0.9 };
      others.end = { x: 0.98, y: 0.9 };
      others.labels = [
        { text: "BY OTHERS 3PLY 2X10 PT", point: { x: 0.9, y: 0.89 } },
      ];
      others.supports = [];
      others.dimensions = [];
      const b = {
        ...r.suggestions[1],
        description: "Deck beams",
        category: "Beams",
        destination: "Materials" as const,
        classification: "Contractor input required" as const,
        specification: "3PLY 2X10 PT",
        quantity: null,
        unit: "runs",
        notes: "New work",
        location: "Deck A",
        sourceFacts: ["S1.0 framing plan physical beam assemblies"],
        beamAssemblies: [...beams, existing, others],
      };
      r.suggestions = [b];
      r.dimensions = [];
      r.sourceObservations = [];
      submitted = true;
      await route.fulfill({ json: r });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Create New Quote" }).click();
    await page.getByLabel("Customer name *").fill("Synthetic regression only");
    await page.getByLabel("Job name *").fill("Synthetic S1.0 spatial beams");
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page.getByLabel("Attach plans", { exact: true }).setInputFiles({
      name: "synthetic-spatial-deck.pdf",
      mimeType: "application/pdf",
      buffer: original,
    });
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    expect(submitted).toBe(true);
    const summary = page.getByRole("region", {
      name: "Material Takeoff Summary",
      exact: true,
    });
    const card = summary.getByRole("article", {
      name: "Takeoff material: Deck beams",
      exact: true,
    });
    const spatial = card.getByRole("region", {
      name: "Proposed physical beam lines",
    });
    await expect(spatial).toContainText("3 proposed beam lines");
    await expect(spatial.locator(".beam-line-summary")).toHaveCount(5);
    await expect(spatial.locator(".beam-line-summary").nth(0)).toContainText(
      "Length: 12′",
    );
    await expect(spatial.locator(".beam-line-summary").nth(1)).toContainText(
      "Length: To confirm",
    );
    await expect(card).toContainText("Material quantity: 3 runs");
    await expect(card).toContainText("Purchasing: To confirm");
    await expect(spatial.locator("details").first()).not.toHaveAttribute(
      "open",
    );
    await spatial.locator("details").first().locator("summary").click();
    await expect(spatial.locator(".beam-line-summary").first()).toContainText(
      "Overall: 24'-3\"",
    );
    await expect(spatial.locator(".beam-line-summary").nth(3)).toContainText(
      "Reference only",
    );
    await expect(
      card.getByRole("button", { name: "Approve", exact: true }),
    ).toBeDisabled();
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await card
      .getByRole("button", {
        name: "Review individual beam measurements",
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel("Number of separate beam runs", { exact: true }),
    ).toHaveValue("3");
    // Storage remains Proposed; no automatic lines or private spatial metadata enter customer output.
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const s = JSON.parse(localStorage.getItem(key)!);
          return s.quotes.find(
            (q: { name: string }) => q.name === "Synthetic S1.0 spatial beams",
          )?.takeoff[0]?.status;
        }, storageKey),
      )
      .toBe("Proposed");
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const s = JSON.parse(localStorage.getItem(key)!);
          return s.quotes.find(
            (q: { name: string }) => q.name === "Synthetic S1.0 spatial beams",
          )?.lines.length;
        }, storageKey),
      )
      .toBe(0);
  });
