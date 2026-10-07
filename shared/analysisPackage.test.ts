import { it, expect } from "vitest";
import {
  analysisPackageSize,
  dataBytes,
  packageProblem,
  maxAnalysisBodyBytes,
} from "./analysisPackage";
import { validateDocuments } from "./analysis";
import { validatePdfRegion } from "./pdf";
const source = (size: number, id = "plan") => ({
  id,
  name: `${id}.pdf`,
  type: "application/pdf",
  data:
    "data:application/pdf;base64," +
    btoa("%PDF-1.7\n" + "x".repeat(size - 15) + "\n%%EOF"),
});
function jpeg(width = 500, height = 500) {
  // Header-only synthetic validation fixture, never a real customer's content.
  const bytes = [
    255,
    216,
    255,
    192,
    0,
    17,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    1,
    17,
    0,
    2,
    17,
    1,
    3,
    17,
    1,
    0,
    255,
    217,
  ];
  return "data:image/jpeg;base64," + btoa(String.fromCharCode(...bytes));
}
const region = {
  page: 1,
  x: 40,
  y: 30,
  width: 144,
  height: 144,
  pageWidth: 2592,
  pageHeight: 1728,
  rotation: 90 as const,
  dpi: 250,
  pixelWidth: 500,
  pixelHeight: 500,
  data: jpeg(),
  encoding: "JPEG" as const,
  quality: 0.96,
};
it("calculates decoded original/detail sizes precisely including base64 padding", () => {
  for (const bytes of ["a", "ab", "abc"])
    expect(dataBytes("data:image/png;base64," + btoa(bytes))).toBe(
      bytes.length,
    );
  const pdf = {
    ...source(1500000),
    detailRegions: [region, region, region, region],
  };
  expect(analysisPackageSize([pdf])).toEqual({
    originals: 1500000,
    details: 4 * 24,
    total: 1500000 + 4 * 24,
    detailCount: 4,
  });
  expect(
    analysisPackageSize([{ ...pdf, detailRegions: [region] }]).details,
  ).toBe(24);
});
it("accepts bounded multi-source packages above the old 4 MB cap without changing original bytes", () => {
  const documents = [
    source(1900000, "a"),
    source(1900000, "b"),
    source(1900000, "c"),
  ];
  expect(packageProblem(documents)).toBe("");
  expect(validateDocuments(documents)).toEqual(documents);
  expect(analysisPackageSize(documents).total).toBe(5700000);
  expect(maxAnalysisBodyBytes).toBe(12000000);
});
it("reports current size and 8 MB budget without silently dropping sources or views", () => {
  const documents = Array.from({ length: 5 }, (_, i) => ({
    ...source(1900000, `source-${i}`),
    ...(i === 0 ? { detailRegions: [region, region, region, region] } : {}),
  }));
  expect(packageProblem(documents)).toMatch(/9.50 MB; allowed size is 8 MB/);
  expect(() => validateDocuments(documents)).toThrow("8 MB");
  expect(documents).toHaveLength(5);
  expect(documents[0].detailRegions).toHaveLength(4);
});
it("validates full-resolution high-quality JPEGs and preserves crop provenance", () => {
  expect(validatePdfRegion(region)).toEqual(region);
  expect(
    validateDocuments([
      { ...source(30), detailRegions: [region, region, region, region] },
    ])[0].detailRegions,
  ).toEqual([region, region, region, region]);
});
it.each([
  { data: jpeg(100, 100) },
  { quality: 0.5 },
  { encoding: "PNG" },
  { data: "data:image/jpeg;base64," + btoa("not a JPEG") },
  { data: region.data.slice(0, -4) },
])(
  "rejects mismatched dimensions, aggressive quality and invalid JPEG headers: %j",
  (changes) => {
    expect(() => validatePdfRegion({ ...region, ...changes })).toThrow();
  },
);
