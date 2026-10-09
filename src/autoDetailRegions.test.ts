import { it, expect } from "vitest";
import {
  suggestPageRegions,
  selectDetailRegions,
  overlap,
} from "./autoDetailRegions";
it("prioritizes real small construction text, bounds crops and avoids heavy overlap without interpreting quantities", () => {
  const marks = [
    { text: "FOOTING: VERIFY DEPTH", x: 20, y: 40, width: 180, height: 6 },
    { text: "BEAM 3-PLY 2x10", x: 30, y: 55, width: 130, height: 6 },
    { text: "STAIR LANDING", x: 1400, y: 900, width: 90, height: 7 },
  ];
  const selected = selectDetailRegions(
    suggestPageRegions(1, 2592, 1728, marks),
  );
  expect(selected).toHaveLength(2);
  expect(selected[0].label).toBe("Foundations & footings");
  expect(overlap(selected[0], selected[1])).toBe(0);
  for (const r of selected) {
    expect(r.x + r.width).toBeLessThanOrEqual(2592);
    expect(r.y + r.height).toBeLessThanOrEqual(1728);
    expect(r).not.toHaveProperty("quantity");
  }
  expect(
    selectDetailRegions(suggestPageRegions(1, 2592, 1728, marks), 20, selected),
  ).toHaveLength(0);
});
it("blank pages do not receive invented grid crops; caps useful candidates at 20", () => {
  expect(suggestPageRegions(1, 2592, 1728, [])).toEqual([]);
  const candidates = Array.from({ length: 30 }, (_, i) => ({
    page: i + 1,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    label: "Drawing content",
    score: 1,
  }));
  expect(selectDetailRegions(candidates)).toHaveLength(20);
  expect(selectDetailRegions(candidates, 2)).toHaveLength(2);
});
it("different page orientations are not treated as the same crop", () => {
  const r = {
    page: 1,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    label: "Manual",
    score: 1,
  };
  expect(overlap({ ...r, rotation: 90 }, r)).toBe(0);
});

it("suppresses the same original source region across viewer rotations", () => {
  const a = {
    page: 1,
    x: 50,
    y: 60,
    width: 100,
    height: 150,
    pageWidth: 600,
    pageHeight: 800,
    rotation: 0,
    label: "manual",
    score: 1,
  };
  const b = {
    ...a,
    x: 800 - 60 - 150,
    y: 50,
    width: 150,
    height: 100,
    pageWidth: 800,
    pageHeight: 600,
    rotation: 90,
  };
  expect(overlap(a, b)).toBe(1);
  expect(selectDetailRegions([b], 20, [a])).toHaveLength(0);
});

it("structural member labels keep their construction group when they also contain verification warnings", () => {
  const [candidate] = suggestPageRegions(1, 1800, 1200, [
    {
      text: "BEAM 2PLY 2X8 PT VERIFY ON SITE",
      x: 500,
      y: 400,
      width: 200,
      height: 6,
    },
  ]);
  expect(candidate.label).toBe("Framing & connections");
  const [notation] = suggestPageRegions(1, 1800, 1200, [
    { text: "4PLY 2X12 SYP", x: 500, y: 400, width: 90, height: 6 },
  ]);
  expect(notation.label).toBe("Framing & connections");
});
