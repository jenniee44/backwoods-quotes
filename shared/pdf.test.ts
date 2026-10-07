import { it, expect } from "vitest";
import {
  detailRenderSize,
  validatePdfRegion,
  validPdfText,
  previewRenderSize,
} from "./pdf";
import { validateDocuments } from "./analysis";
function png(width: number, height: number) {
  const header = new Uint8Array(24);
  header.set([137, 80, 78, 71, 13, 10, 26, 10]);
  header.set([73, 72, 68, 82], 12);
  const view = new DataView(header.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return "data:image/png;base64," + btoa(String.fromCharCode(...header));
}
const region = {
  page: 1,
  x: 40,
  y: 30,
  width: 144,
  height: 144,
  pageWidth: 2592,
  pageHeight: 1728,
  dpi: 250,
  pixelWidth: 500,
  pixelHeight: 500,
  data: png(500, 500),
};
const pdf = {
  id: "plan",
  name: "original.pdf",
  type: "application/pdf",
  data:
    "data:application/pdf;base64," +
    btoa("%PDF-1.7\noriginal vector data\n%%EOF"),
};
const text = {
  pageCount: 1,
  truncated: false,
  pages: [
    {
      page: 1,
      width: 2592,
      height: 1728,
      text: '2x8 PT @ 16" O/C',
      status: "Available",
    },
  ],
};
it("preserves original PDF bytes and selectable text rather than substituting a preview", () => {
  const validated = validateDocuments([
    {
      ...pdf,
      pdfText: text,
      detailRegions: [region],
      previewThumbnail: "never sent",
    },
  ]);
  expect(validated[0].data).toBe(pdf.data);
  expect(validated[0].pdfText).toEqual(text);
  expect(validated[0].detailRegions?.[0]).toEqual(region);
  expect(validated[0]).not.toHaveProperty("previewThumbnail");
});
it("250 DPI detail sizing does not depend on display/Retina resolution", () => {
  expect(detailRenderSize(144, 144)).toEqual({
    pixelWidth: 500,
    pixelHeight: 500,
  });
  expect(validatePdfRegion(region)).toEqual(region);
});
it("large sheets cannot be silently reduced to thumbnails", () => {
  expect(() => detailRenderSize(2592, 1728)).toThrow(
    "Zoom into a smaller region",
  );
  expect(() => detailRenderSize(1500, 500)).toThrow();
  expect(detailRenderSize(400, 200)).toEqual({
    pixelWidth: 1389,
    pixelHeight: 695,
  });
});
it.each([
  { dpi: 72 },
  { pixelWidth: 900 },
  { width: 3000 },
  { x: -1 },
  { page: 0 },
  { data: png(100, 100) },
  { data: "data:image/jpeg;base64,bad" },
])(
  "rejects malformed, low-resolution or out-of-page details: %j",
  (changes) => {
    expect(() =>
      validateDocuments([
        { ...pdf, detailRegions: [{ ...region, ...changes }] },
      ]),
    ).toThrow();
  },
);
it("limits detail count and aggregate bytes without touching the original", () => {
  expect(() =>
    validateDocuments([{ ...pdf, detailRegions: Array(5).fill(region) }]),
  ).toThrow("four");
  const large = region.data + "A".repeat(2_600_000);
  expect(() =>
    validateDocuments([
      {
        ...pdf,
        detailRegions: [
          { ...region, data: large },
          { ...region, data: large },
          { ...region, data: large },
        ],
      },
    ]),
  ).toThrow("4 MB");
  expect(pdf.data).toContain("JVBERi");
});
it("validates text/page budgets and rejects text from non-PDF sources", () => {
  expect(validPdfText(text)).toBe(true);
  expect(validPdfText({ ...text, pages: [...text.pages, ...text.pages] })).toBe(
    false,
  );
  expect(
    validPdfText({
      ...text,
      pages: [{ ...text.pages[0], text: "A".repeat(8001) }],
    }),
  ).toBe(false);
  expect(() =>
    validateDocuments([
      { ...pdf, type: "image/png", data: png(1, 1), pdfText: text },
    ]),
  ).toThrow("text layer");
});
it("allocates only a Safari-safe Retina viewport, not an entire huge drawing", () => {
  expect(previewRenderSize(350, 400, 3)).toEqual({
    density: 3,
    pixelWidth: 1050,
    pixelHeight: 1200,
  });
  const view = previewRenderSize(900, 1000, 3);
  expect(view.pixelWidth).toBeLessThanOrEqual(2048);
  expect(view.pixelHeight).toBeLessThanOrEqual(2048);
});
