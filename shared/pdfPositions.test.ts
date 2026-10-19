import { expect, it } from "vitest";
import { positionedPdfText, validTextPositions } from "./pdfPositions";
import { validPdfText } from "./pdf";
import { validateDocuments } from "./analysis";
const items = [
  { str: "3PLY 2X10 PT", width: 60, transform: [10, 0, 0, 10, 100, 300] },
];
it("retains actual text bounds and baseline orientation without inferring site dimensions", () => {
  const p = positionedPdfText(
    items,
    { width: 800, height: 600, transform: [1, 0, 0, -1, 0, 600] },
    4000,
  );
  expect(p.runs).toHaveLength(1);
  expect(p.runs[0]).toMatchObject({
    text: "3PLY 2X10 PT",
    x: 0.125,
    angle: 0,
  });
  expect(p.runs[0].width).toBeCloseTo(0.075);
  expect(p.runs[0].y).toBeCloseTo(290 / 600);
  expect(p.runs[0].height).toBeCloseTo(10 / 600);
  expect(validTextPositions(p.runs)).toBe(true);
});
it("handles intrinsic rotated pages in their original viewport coordinate system", () => {
  const p = positionedPdfText(
    items,
    { width: 600, height: 800, transform: [0, 1, 1, 0, 0, 0] },
    4000,
  );
  expect(p.runs[0]).toMatchObject({ x: 0.5, y: 0.125, angle: 90 });
  expect(p.runs[0].height).toBeCloseTo(0.075);
});
it("marks exhausted budgets and does not upscale or fabricate text for scans", () => {
  const p = positionedPdfText(
    items,
    { width: 800, height: 600, transform: [1, 0, 0, -1, 0, 600] },
    0,
  );
  expect(p.runs).toEqual([]);
  expect(p.truncated).toBe(true);
  expect(
    positionedPdfText(
      [],
      { width: 800, height: 600, transform: [1, 0, 0, -1, 0, 600] },
      4000,
    ).runs,
  ).toEqual([]);
  expect(
    validTextPositions([
      { text: "x", x: -1, y: 0, width: 1, height: 1, angle: 0 },
    ]),
  ).toBe(false);
  expect(
    validTextPositions([
      { text: "x", x: 0, y: 0, width: 1, height: 1, angle: 0, verified: true },
    ]),
  ).toBe(false);
});
it("preserves bounded geometry through document sanitization and remains compatible with old text-only pages", () => {
  const positions = positionedPdfText(
    items,
    { width: 800, height: 600, transform: [1, 0, 0, -1, 0, 600] },
    4000,
  ).runs;
  const page = {
    page: 1,
    width: 800,
    height: 600,
    text: "3PLY 2X10 PT",
    status: "Available" as const,
    positions,
    positionsTruncated: false,
  };
  const layer = { pageCount: 1, truncated: false, pages: [page] };
  expect(validPdfText(layer)).toBe(true);
  const docs = validateDocuments([
    {
      id: "synthetic",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF"),
      pdfText: layer,
    },
  ]);
  expect(docs[0].pdfText).toEqual(layer);
  const { positions: discarded, ...old } = page;
  expect(discarded).toHaveLength(1);
  expect(validPdfText({ ...layer, pages: [old] })).toBe(true);
  expect(
    validPdfText({
      ...layer,
      pages: [{ ...page, positions: [{ ...positions[0], width: 3 }] }],
    }),
  ).toBe(false);
});
