import { expect, it } from "vitest";
import {
  analysisPageRegions,
  selectAnalysisRegions,
} from "./analysisDetailRegions";
import { detailRenderSize } from "../shared/pdf";
import { overlap } from "./autoDetailRegions";
const survey = { width: 300, height: 200, ink: new Uint8Array(60000).fill(1) };
it("targets structural annotations and dimensions without expanding to a full connected sheet", () => {
  const marks = [
    { text: "3PLY 2X10 PT", x: 900, y: 600, width: 120, height: 6 },
    { text: "24'-3\" OVERALL", x: 940, y: 440, width: 100, height: 6 },
    { text: "JOISTS AT 16 IN O/C", x: 1700, y: 1000, width: 150, height: 6 },
    {
      text: "DRAWN BY PROJECT ADDRESS",
      x: 2400,
      y: 1600,
      width: 140,
      height: 6,
    },
  ];
  const regions = selectAnalysisRegions(
    analysisPageRegions(1, 2592, 1728, marks, survey),
    8,
  );
  expect(regions.some((r) => r.label.includes("Beam"))).toBe(true);
  expect(regions.some((r) => r.label.includes("Joists"))).toBe(true);
  for (const r of regions) {
    expect(r.width).toBeLessThanOrEqual(700);
    expect(r.height).toBe(340);
    expect(() => detailRenderSize(r.width, r.height)).not.toThrow();
    expect(r).not.toHaveProperty("quantity");
  }
  expect(analysisPageRegions(1, 2592, 1728, [marks[3]], survey)).toEqual([]);
});
it("does not crop blank pages or ordinary readable small pages; scans only use occupied content", () => {
  const blank = { ...survey, ink: new Uint8Array(60000) };
  const m = { text: "BEAM 3PLY", x: 100, y: 100, width: 80, height: 16 };
  expect(analysisPageRegions(1, 600, 800, [m], survey)).toEqual([]);
  expect(analysisPageRegions(1, 2592, 1728, [m], blank)).toEqual([]);
  expect(analysisPageRegions(1, 2592, 1728, [], blank)).toEqual([]);
});
it("distributes an economical eight-view budget across pages and topics without heavy overlap or extra assemblies", () => {
  const candidates = Array.from({ length: 12 }, (_, i) => ({
    page: i < 10 ? 1 : 2,
    x: i * 500,
    y: 0,
    width: 420,
    height: 340,
    label: i < 10 ? "Beam / support association" : "Footings / posts",
    score: 30,
  }));
  const selected = selectAnalysisRegions(candidates, 24);
  expect(selected).toHaveLength(8);
  expect(selected.some((r) => r.page === 2)).toBe(true);
  expect(
    selected.every((a, i) =>
      selected.slice(i + 1).every((b) => overlap(a, b) <= 0.45),
    ),
  ).toBe(true);
  expect(selectAnalysisRegions(candidates, 1, [candidates[0]])[0]).not.toEqual(
    candidates[0],
  );
});
