import { expect, it } from "vitest";
import type { PDFPageProxy } from "pdfjs-dist";
import {
  chooseDetailOrientation,
  orientDetail,
  textBounds,
  type PositionedText,
} from "./detailReadability";
import { overlap } from "./autoDetailRegions";
import type { PdfRotation } from "../shared/pdf";
function text(
  angle: number,
  x = 100,
  y = 150,
  str = "JOISTS 2x8 PT @ 16 IN O/C",
): PositionedText {
  const a = (angle * Math.PI) / 180,
    c = Math.round(Math.cos(a)),
    s = Math.round(Math.sin(a));
  return {
    str,
    width: 120,
    height: 6,
    transform: [6 * c, 6 * s, -6 * s, 6 * c, x, y],
  };
}
const page = {
  getViewport({ rotation = 0 }: { rotation?: number; scale: number }) {
    const w = 1000,
      h = 800;
    return {
      width: rotation % 180 ? h : w,
      height: rotation % 180 ? w : h,
      convertToViewportPoint(x: number, y: number) {
        return rotation === 90
          ? [y, x]
          : rotation === 180
            ? [w - x, y]
            : rotation === 270
              ? [h - y, w - x]
              : [x, h - y];
      },
      convertToPdfPoint(x: number, y: number) {
        return rotation === 90
          ? [y, x]
          : rotation === 180
            ? [w - x, y]
            : rotation === 270
              ? [w - y, h - x]
              : [x, h - y];
      },
    };
  },
} as unknown as Pick<PDFPageProxy, "getViewport">;
for (const angle of [0, 90, 180, 270] as const)
  it(`reads ${angle} degree text independently and preserves its original source area`, () => {
    const item = text(angle, 300, 300);
    const bounds = textBounds(
      item,
      page.getViewport({ scale: 1, rotation: 0 }),
    );
    const region = {
      ...bounds,
      x: bounds.x - 15,
      y: bounds.y - 15,
      width: bounds.width + 30,
      height: bounds.height + 30,
      rotation: 0 as PdfRotation,
      page: 1,
      pageWidth: 1000,
      pageHeight: 800,
      label: "Framing",
      score: 1,
    };
    const result = orientDetail(page, region, [
      item,
      text((angle + 180) % 360, 700, 500),
    ]);
    expect(result.rotation).toBe(angle);
    expect(result.inspectionNote).toContain("Text direction checked");
    expect(overlap(region, result)).toBeCloseTo(1);
    expect(result.width).toBeCloseTo(150);
    expect(result.height).toBeCloseTo(36);
  });
it("construction text outranks administrative headings regardless of heading size", () => {
  expect(
    chooseDetailOrientation(180, [
      text(90),
      text(180, 0, 0, "DRAWN BY / REVISION / PROJECT ADDRESS / SHEET NUMBER"),
    ]),
  ).toMatchObject({ rotation: 90, reliable: true });
});
it("ambiguous mixed directions and scanned regions require inspection rather than an orientation guess", () => {
  expect(chooseDetailOrientation(270, [text(0), text(180)])).toMatchObject({
    rotation: 270,
    reliable: false,
  });
  expect(chooseDetailOrientation(90, [])).toMatchObject({
    rotation: 90,
    reliable: false,
  });
});
it("mirrored text is never claimed to be corrected by quarter-turn rotation", () => {
  const mirrored = text(0);
  mirrored.transform[3] = -6;
  expect(chooseDetailOrientation(180, [mirrored])).toMatchObject({
    rotation: 180,
    reliable: false,
  });
});
it("sideways text bounds follow its physical PDF position, not an unrotated width", () => {
  const b = textBounds(text(90), page.getViewport({ scale: 1, rotation: 0 }));
  expect(b).toEqual({ x: 94, y: 530, width: 6, height: 120 });
});

it("oblique construction text still counts against confidence instead of being silently ignored", () => {
  const oblique = text(0);
  const a = Math.PI / 6;
  oblique.transform = [
    6 * Math.cos(a),
    6 * Math.sin(a),
    -6 * Math.sin(a),
    6 * Math.cos(a),
    100,
    150,
  ];
  expect(chooseDetailOrientation(180, [oblique, text(0)])).toMatchObject({
    rotation: 180,
    reliable: false,
  });
});

it("mostly clipped text from outside a detail cannot reverse its readable local annotation", () => {
  const region = {
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    rotation: 0 as PdfRotation,
    label: "Framing",
  };
  const local = text(0, 140, 620, "BEAM SPECIFICATION PT LUMBER");
  const outside = text(
    180,
    410,
    620,
    "FOOTING NOTES CONNECTION SPECIFICATIONS",
  );
  outside.width = 120;
  expect(orientDetail(page, region, [local, outside]).rotation).toBe(0);
});
it("member annotations take priority over perpendicular dimension strings without a universal rotation", () => {
  expect(
    chooseDetailOrientation(180, [
      text(0, 100, 100, "JOISTS PT MEMBER SPECIFICATION"),
      text(90, 100, 100, "16 IN"),
      text(90, 100, 100, "20 FT"),
    ]),
  ).toMatchObject({ rotation: 0, reliable: true });
});
it("text geometry respects the font's real vertical axis for sheared annotations", () => {
  const item = text(0);
  item.transform[2] = 3;
  const b = textBounds(item, page.getViewport({ scale: 1, rotation: 0 }));
  expect(b.width).toBeCloseTo(120 + (6 * 3) / Math.sqrt(45));
});

it("readable safety/status warnings can establish their own upright orientation", () => {
  expect(
    chooseDetailOrientation(180, [
      text(0, 100, 150, "REVISION 3 - NOT FOR CONSTRUCTION"),
    ]),
  ).toMatchObject({ rotation: 0, reliable: true });
});

it("a supported local majority suggests an upright view while remaining explicitly uncertain", () => {
  const result = chooseDetailOrientation(180, [
    text(0, 100, 100),
    text(0, 100, 200),
    text(90),
  ]);
  expect(result).toMatchObject({
    rotation: 0,
    reliable: false,
    suggested: true,
  });
});

it("duplicate text overlays cannot overpower independent upright notes", () => {
  const duplicate = text(180, 100, 150, "BEAM SPECIFICATION LUMBER");
  const result = chooseDetailOrientation(180, [
    ...Array.from({ length: 20 }, () => duplicate),
    text(0, 100, 300),
    text(0, 100, 400),
    text(0, 100, 500),
  ]);
  expect(result.rotation).toBe(0);
});
it("one long reversed note does not silently dominate multiple local member annotations", () => {
  const result = chooseDetailOrientation(180, [
    text(180, 100, 100, "BEAM SPECIFICATION ".repeat(20)),
    text(0, 100, 200),
    text(0, 100, 300),
    text(0, 100, 400),
  ]);
  expect(result.rotation).toBe(0);
});
