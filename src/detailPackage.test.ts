import { it, expect } from "vitest";
import type { AnalysisDocument } from "../shared/analysis";
import { assertDetailInclusion } from "./detailPackage";
const source = {
  id: "plan",
  data: "original",
  detailRegions: [
    {
      page: 1,
      rotation: 180,
      x: 20,
      y: 30,
      width: 100,
      height: 200,
      dpi: 250,
      pixelWidth: 348,
      pixelHeight: 695,
      data: "captured",
    },
  ],
} as AnalysisDocument;
it("allows encoding optimization but requires every selected source and crop", () => {
  expect(() =>
    assertDetailInclusion(
      [source],
      [
        {
          ...source,
          detailRegions: source.detailRegions!.map((r) => ({
            ...r,
            data: "optimized",
          })),
        },
      ],
    ),
  ).not.toThrow();
  expect(() =>
    assertDetailInclusion([source], [{ ...source, detailRegions: [] }]),
  ).toThrow("missing");
  expect(() =>
    assertDetailInclusion([source], [{ ...source, data: "changed" }]),
  ).toThrow("original");
  expect(() =>
    assertDetailInclusion(
      [source],
      [
        {
          ...source,
          detailRegions: source.detailRegions!.map((r) => ({
            ...r,
            rotation: 0,
          })),
        },
      ],
    ),
  ).toThrow("missing");
});
it("allows an explicitly empty original-only package without inventing details", () => {
  const original = { ...source, detailRegions: undefined };
  expect(() => assertDetailInclusion([original], [original])).not.toThrow();
});

it("rejects added originals and reordered detail indexes so provenance cannot silently change", () => {
  const second = { ...source.detailRegions![0], page: 2 };
  const expected = {
    ...source,
    detailRegions: [...source.detailRegions!, second],
  };
  expect(() =>
    assertDetailInclusion(
      [source],
      [source, { ...source, id: "unrelated", detailRegions: [] }],
    ),
  ).toThrow("original");
  expect(() =>
    assertDetailInclusion(
      [expected],
      [{ ...expected, detailRegions: [second, ...source.detailRegions!] }],
    ),
  ).toThrow("missing");
});
