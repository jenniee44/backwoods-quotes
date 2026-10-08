import { it, expect } from "vitest";
import { analysisBatches, analyzeBatches } from "./analysisBatches";
import { analysisPackageSize } from "../shared/analysisPackage";
import { analysisFixture } from "../shared/analysis.fixture";
import type { AnalysisDocument } from "../shared/analysis";
const header = new Uint8Array(24);
header.set([137, 80, 78, 71, 13, 10, 26, 10]);
header.set([73, 72, 68, 82], 12);
const v = new DataView(header.buffer);
v.setUint32(16, 500);
v.setUint32(20, 500);
const detail = {
  page: 1,
  x: 0,
  y: 0,
  width: 144,
  height: 144,
  pageWidth: 2592,
  pageHeight: 1728,
  dpi: 250,
  pixelWidth: 500,
  pixelHeight: 500,
  data:
    "data:image/png;base64," +
    btoa(String.fromCharCode(...header) + "x".repeat(1_700_000)),
};
const source: AnalysisDocument = {
  id: "plan",
  name: "synthetic.pdf",
  type: "application/pdf",
  data: "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF"),
  detailRegions: Array.from({ length: 6 }, (_, i) => ({
    ...detail,
    x: i * 150,
  })),
};
it("batches every detail exactly once with the unchanged originals and keeps each request bounded", () => {
  const batches = analysisBatches([source]);
  expect(batches).toHaveLength(2);
  expect(batches.flatMap((b) => b.indices.plan)).toEqual([1, 2, 3, 4, 5, 6]);
  for (const b of batches) {
    expect(b.documents[0].data).toBe(source.data);
    expect(analysisPackageSize(b.documents).total).toBeLessThanOrEqual(
      8_000_000,
    );
  }
});
it("remaps detail references across requests and preserves results until atomic completion", async () => {
  const result = await analyzeBatches(
    [source],
    new AbortController().signal,
    async () => {
      const r = analysisFixture();
      r.suggestions = [{ ...r.suggestions[1], sourceDetailView: 1 }];
      return r;
    },
  );
  expect(result.suggestions.map((s) => s.sourceDetailView)).toEqual([1]);
  expect(result.suggestions[0].sourceFacts?.join()).toContain("detail 5");
  let calls = 0;
  await expect(
    analyzeBatches([source], new AbortController().signal, async () => {
      if (++calls === 2) throw new Error("Rate limited");
      return analysisFixture();
    }),
  ).rejects.toThrow("Rate limited");
});
it("cancellation and impossible original/detail packages fail without silently dropping content", async () => {
  const c = new AbortController();
  c.abort();
  await expect(
    analyzeBatches([source], c.signal, async () => analysisFixture()),
  ).rejects.toThrow();
  expect(() =>
    analysisBatches([{ ...source, detailRegions: Array(25).fill(detail) }]),
  ).toThrow("24");
});
