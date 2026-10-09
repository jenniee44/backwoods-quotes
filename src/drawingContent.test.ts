import { it, expect } from "vitest";
import { surveyPixels, contentRegions, regionInk } from "./drawingContent";
function pixels(ink = false) {
  const data = new Uint8ClampedArray(300 * 200 * 4).fill(255);
  if (ink)
    for (let y = 70; y < 90; y++)
      for (let x = 100; x < 140; x++) {
        const i = (y * 300 + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
  return data;
}
it("blank pages create no crops even with misleading embedded keywords", () => {
  const blank = surveyPixels(300, 200, pixels());
  expect(contentRegions(1, 1800, 1200, [], blank)).toEqual([]);
  expect(
    contentRegions(
      1,
      1800,
      1200,
      [{ text: "FOOTING", x: 20, y: 20, width: 50, height: 6 }],
      blank,
    ),
  ).toEqual([]);
});
it("scans propose occupied drawing content only; construction text has higher priority", () => {
  const survey = surveyPixels(300, 200, pixels(true));
  const crops = contentRegions(
    1,
    1800,
    1200,
    [{ text: "BEAM CONNECTION NOTES", x: 600, y: 420, width: 100, height: 6 }],
    survey,
  );
  expect(crops.length).toBeGreaterThan(0);
  expect(crops.some((c) => c.label === "Framing & connections")).toBe(true);
  expect(crops.every((c) => regionInk(survey, c, 1800, 1200) >= 8)).toBe(true);
  expect(crops.every((c) => !("quantity" in c))).toBe(true);
  expect(crops.every((c) => c.width < 560 || c.height < 380)).toBe(true);
});
it("sheet-edge borders alone are not interpreted as construction content", () => {
  const data = pixels();
  for (let x = 0; x < 300; x++) {
    const i = x * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
  }
  expect(
    contentRegions(1, 1800, 1200, [], surveyPixels(300, 200, data)),
  ).toEqual([]);
});

it("inset sheet-border frames do not create blank detail crops", () => {
  const data = pixels();
  const dark = (x: number, y: number) => {
    const i = (y * 300 + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 0;
  };
  for (let x = 10; x < 290; x++) {
    dark(x, 10);
    dark(x, 190);
  }
  for (let y = 10; y < 191; y++) {
    dark(10, y);
    dark(289, y);
  }
  expect(
    contentRegions(1, 1800, 1200, [], surveyPixels(300, 200, data)),
  ).toEqual([]);
});
