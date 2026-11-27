import { selectEditorTab } from "./fixtures/selectEditorTab";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { constructionPdf } from "./fixtures/constructionPdf";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";

// Optional private regression: supply an original PDF and a separately reviewed
// evidence inventory. Neither customer drawings nor their coordinates enter Git.
// PRIVATE_BEAM_REPLAY=1 PRIVATE_TAKEOFF_PDF=/private/plan.pdf PRIVATE_BEAM_LAYOUT_JSON=/private/evidence.json
// npm run test:e2e -- e2e/private-beam-layout.spec.ts
const pdfPath = process.env.PRIVATE_BEAM_REPLAY === "1" ? process.env.PRIVATE_TAKEOFF_PDF : undefined;
const fixturePath = process.env.PRIVATE_BEAM_REPLAY === "1" ? process.env.PRIVATE_BEAM_LAYOUT_JSON : undefined;
test("original PDF and reviewed inventory preserve physical beams without purchasing assumptions", async ({
  page,
}) => {
  test.setTimeout(120000);
  if (process.env.PRIVATE_BEAM_REPLAY === "1" && (!pdfPath || !fixturePath)) throw new Error("Supply both paths for a private replay.");
  const pdf = pdfPath ? await readFile(pdfPath) : Buffer.from(constructionPdf({
    width: 900,
    height: 700,
    notes: ["FRAMING PLAN", "3PLY 2X10 PT"],
    pageDrawing: ["180 490 m 720 490 l S 180 350 m 720 350 l S 180 210 m 720 210 l S"],
  }), "ascii");
  const data = "data:application/pdf;base64," + pdf.toString("base64");
  const fixture = fixturePath ? JSON.parse(await readFile(fixturePath, "utf8")) : {
    inventory: syntheticDeckBeams().map(beam => ({
      ...beam,
      documentId: "synthetic-replay-plan",
      view: "Framing plan",
      location: "Synthetic framing plan",
      sourceDetailView: null,
    })),
    expectedPhysicalLines: 3,
    expectedFullLengths: 0,
    expectCompleteContext: false,
  };
  let analysisRequests = 0;
  await page.route("**/api/plan-analysis", async (route) => {
    analysisRequests++;
    await route.abort();
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your work, at a glance." })).toBeVisible();
  const result = await page.evaluate(
    async ({ data, fixture }) => {
      const { loadPdfSource, extractPdfText } =
        await import("/src/pdfSource.ts");
      const { generatePdfDetails } = await import("/src/generatePdfDetails.ts");
      const { detailSourceMapping } =
        await import("/shared/detailCoordinates.ts");
      const { analysisFixture } = await import("/shared/analysis.fixture.ts");
      const { validateAnalysis } = await import("/shared/analysis.ts");
      const { seed } = await import("/src/model.ts");
      const { readDurableStore, writeDurableStore } = await import("/src/durableStore.ts");
      const { addAnalysisSuggestions } = await import("/src/planAnalysis.ts");
      const { prepareDeckTakeoff, materialTakeoffProposal } =
        await import("/src/deckTakeoff.ts");
      const { uniqueSpatialBeams } = await import("/shared/spatialBeams.ts");
      const task = await loadPdfSource(data);
      try {
        const pdf = await task.promise;
        const text = await extractPdfText(pdf);
        const details = await generatePdfDetails(
          pdf,
          new AbortController().signal,
          8,
          [],
          () => {},
          "analysis",
        );
        const points = fixture.inventory.flatMap((b) => [
          b.start,
          b.end,
          ...b.supports.map((s) => s.point),
        ]);
        const completeContext = details.views.some((r) => {
          const bounds = detailSourceMapping(r)?.bounds;
          return (
            r.label.startsWith("Connected drawing context") &&
            bounds &&
            points.every(
              (p) =>
                p.x >= bounds.x &&
                p.x <= bounds.x + bounds.width &&
                p.y >= bounds.y &&
                p.y <= bounds.y + bounds.height,
            )
          );
        });
        const input = analysisFixture(fixture.inventory[0].documentId);
        input.suggestions = [];
        input.dimensions = [];
        input.sourceObservations = [];
        input.beamLayoutInventory = fixture.inventory;
        const document = {
          id: fixture.inventory[0].documentId,
          name: "Private plan.pdf",
          type: "application/pdf",
          data,
          addedAt: "2026-01-01",
          pdfText: text,
        };
        const normalized = validateAnalysis(input, [document.id], [document]);
        const base = await readDurableStore();
        const store = seed();
        const q = prepareDeckTakeoff(
          addAnalysisSuggestions(
            {
              ...store.quotes[0],
              name: "Private beam replay",
              documents: [document],
              takeoff: [],
            },
            normalized,
          ),
        );
        store.quotes = [q];
        await writeDurableStore(store, base);
        const t = q.takeoff.find(
          (t) => t.status !== "Rejected" && t.destination === "Materials",
        )!;
        const groups = uniqueSpatialBeams(t.beamAssemblies!);
        const proposal = materialTakeoffProposal(t);
        return {
          count: groups.length,
          fullLengths: groups.filter(
            (_g, i) => t.calculation?.inputs[`length${i + 1}`] != null,
          ).length,
          purchase: proposal.purchase,
          originalPreserved: q.documents[0].data === data,
          completeContext,
          views: details.views.length,
          approved: q.takeoff.some((t) => t.status === "Approved"),
        };
      } finally {
        await task.destroy();
      }
    },
    { data, fixture },
  );
  expect(result.count).toBe(fixture.expectedPhysicalLines);
  expect(result.fullLengths).toBe(fixture.expectedFullLengths);
  expect(result.purchase).toBeNull();
  expect(result.originalPreserved).toBe(true);
  expect(result.approved).toBe(false);
  expect(result.views).toBeLessThanOrEqual(8);
  if (fixture.expectCompleteContext) expect(result.completeContext).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: /Private beam replay/ }).click();
  await selectEditorTab(page, "Plans & Takeoff");
  await page.getByRole("button", { name: /Preliminary Shopping List/ }).click();
  await page
    .locator(".preliminary-materials")
    .getByRole("button", { name: "Review details", exact: true })
    .click();
  const panel = page.getByRole("group", {
    name: "Material purchasing calculator",
  });
  await panel
    .getByText("Drawing associations and references", { exact: true })
    .click();
  await expect(
    panel
      .getByRole("region", { name: "Proposed physical beam lines" })
      .locator(".beam-line-summary"),
  ).toHaveCount(fixture.expectedPhysicalLines);
  expect(analysisRequests).toBe(0);
});
