import { it, expect } from "vitest";
import { readableRotation, rotateDetailBounds } from "./pdfOrientation";
import type { PdfDetailRegion } from "../shared/pdf";
it.each([0, 90, 180, 270])(
  "makes embedded text upright regardless of incorrect /Rotate %s",
  (intrinsic) => {
    expect(
      readableRotation(intrinsic, [
        {
          str: "FOOTINGS AND CONSTRUCTION NOTES",
          transform: [6, 0, 0, 6, 20, 30],
        },
      ]),
    ).toEqual({ rotation: 0, reliable: true });
  },
);
it.each([0, 90, 180, 270])(
  "corrects text baseline at %s degrees rather than double-applying intrinsic rotation",
  (angle) => {
    const rad = (angle * Math.PI) / 180;
    expect(
      readableRotation(180, [
        {
          str: "READABLE BEAM SPECIFICATIONS",
          transform: [6 * Math.cos(rad), 6 * Math.sin(rad), 0, 6, 0, 0],
        },
      ]).rotation,
    ).toBe(angle);
  },
);
it("does not pretend scans, ambiguous mixed text or skewed text have a verified orientation", () => {
  expect(readableRotation(270, [])).toEqual({ rotation: 270, reliable: false });
  expect(
    readableRotation(180, [
      { str: "AAAAAA BBBBBB", transform: [6, 0, 0, 6, 0, 0] },
      { str: "CCCCCC DDDDDD", transform: [0, 6, -6, 0, 0, 0] },
    ]).reliable,
  ).toBe(false);
});
it("quarter turns preserve the physical crop and round-trip all bounds", () => {
  const r = {
    x: 30,
    y: 50,
    width: 100,
    height: 150,
    pageWidth: 600,
    pageHeight: 800,
    rotation: 0,
  } as PdfDetailRegion;
  const next = rotateDetailBounds(r, 90);
  expect(next).toMatchObject({
    x: 600,
    y: 30,
    width: 150,
    height: 100,
    pageWidth: 800,
    pageHeight: 600,
    rotation: 90,
  });
  expect(rotateDetailBounds(next, -90)).toEqual(r);
  let full = r;
  for (let i = 0; i < 4; i++) full = rotateDetailBounds(full, 90);
  expect(full).toEqual(r);
});
