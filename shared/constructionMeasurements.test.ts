import { expect, it } from "vitest";
import { drawingMeasurements } from "./constructionMeasurements";
const source = {
  documentId: "synthetic.pdf",
  page: 2,
  sourceDetailView: 3,
  confidence: "Medium",
};
it("preserves exact fractional, metric and imperial notation with source and confidence", () => {
  const measurements = drawingMeasurements({
    ...source,
    sourceFacts: ["Deck span 12'-6 1/2\"; spacing 16 in; footing 300 mm"],
  });
  expect(measurements.map((m) => m.written)).toEqual([
    "12'-6 1/2\"",
    "16 in",
    "300 mm",
  ]);
  expect(measurements[0].inches).toBe(150.5);
  expect(measurements[2].inches).toBeCloseTo(300 / 25.4);
  expect(measurements[0]).toMatchObject({
    documentId: source.documentId,
    page: source.page,
    confidence: source.confidence,
    detail: 3,
  });
});
it("never treats nominal sizes, unknowns, conflicting dimensions or bare numbers as verified measurements", () => {
  expect(
    drawingMeasurements({
      ...source,
      sourceFacts: [
        "4PLY 2X12 SYP",
        "12 supports",
        "Unreadable 12 ft",
        "Conflicting span 9 ft or 12 ft",
        "Approximate 12 ft",
      ],
    }),
  ).toEqual([]);
});
it("extracts dimensional observations without inferring direction, purchasing or approval", () => {
  const measurements = drawingMeasurements({
    ...source,
    sourceFacts: [
      "Overall 20 feet by 12 feet",
      "Board actual width 5 1/2 inches",
    ],
  });
  expect(measurements.map((m) => m.inches)).toEqual([240, 144, 5.5]);
  expect(measurements.every((m) => !("verified" in m))).toBe(true);
});
