import { expect, it } from "vitest";
import { detailSourceMapping } from "./detailCoordinates";
import {
  validatePdfRegion,
  type PdfDetailRegion,
  type PdfRotation,
} from "./pdf";
const header = new Uint8Array(24);
header.set([137, 80, 78, 71, 13, 10, 26, 10]);
header.set([73, 72, 68, 82], 12);
new DataView(header.buffer).setUint32(16, 500);
new DataView(header.buffer).setUint32(20, 500);
export const mappedDetail: PdfDetailRegion = {
  page: 1,
  x: 0,
  y: 0,
  width: 144,
  height: 144,
  pageWidth: 800,
  pageHeight: 600,
  dpi: 250,
  pixelWidth: 500,
  pixelHeight: 500,
  data: "data:image/png;base64," + btoa(String.fromCharCode(...header)),
  rotation: 0,
  sourcePageRotation: 0,
};
it("maps each crop image corner into the original text-position viewport for every intrinsic and displayed quarter turn", () => {
  for (const source of [0, 90, 180, 270])
    for (const turn of [0, 90, 180, 270]) {
      const r = {
        ...mappedDetail,
        x: 100,
        y: 60,
        width: 200,
        height: 120,
        pageWidth: 800,
        pageHeight: 600,
        sourcePageRotation: source as PdfRotation,
        rotation: ((source + turn) % 360) as PdfRotation,
      };
      const corners = detailSourceMapping(r)!.imageCornersInOriginalPage;
      const forward = (x: number, y: number) =>
        turn === 90
          ? { x: 1 - y, y: x }
          : turn === 180
            ? { x: 1 - x, y: 1 - y }
            : turn === 270
              ? { x: y, y: 1 - x }
              : { x, y };
      const expected = [
        { x: 100 / 800, y: 60 / 600 },
        { x: 300 / 800, y: 60 / 600 },
        { x: 300 / 800, y: 180 / 600 },
        { x: 100 / 800, y: 180 / 600 },
      ];
      corners.forEach((p, i) => {
        const q = forward(p.x, p.y);
        expect(q.x).toBeCloseTo(expected[i].x);
        expect(q.y).toBeCloseTo(expected[i].y);
      });
    }
});
it("preserves validated mapping provenance and does not invent mappings for legacy captures", () => {
  expect(validatePdfRegion(mappedDetail).sourcePageRotation).toBe(0);
  expect(() =>
    validatePdfRegion({ ...mappedDetail, sourcePageRotation: 45 }),
  ).toThrow();
  expect(
    detailSourceMapping({ ...mappedDetail, sourcePageRotation: undefined }),
  ).toBeUndefined();
});
