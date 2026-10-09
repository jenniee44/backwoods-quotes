import { it, expect } from "vitest";
import { surveyPixels, contentRegions, regionInk } from "./drawingContent";
import { selectDetailRegions } from "./autoDetailRegions";
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

it("preserves a construction callout crossing a candidate edge while removing blank margins", () => {
  const survey = surveyPixels(300, 200, pixels(true));
  const mark = {
    text: "BEAM CONNECTION NOTES",
    x: 600,
    y: 420,
    width: 520,
    height: 6,
  };
  const regions = contentRegions(1, 1800, 1200, [mark], survey);
  const r = regions.find((r) => r.label === "Framing & connections")!;
  expect(r.x).toBeLessThanOrEqual(mark.x);
  expect(r.x + r.width).toBeGreaterThanOrEqual(mark.x + mark.width);
  expect(r.height).toBeLessThan(380);
});
it("administrative-only title blocks are not proposed as useful construction details", () => {
  expect(
    contentRegions(
      1,
      1800,
      1200,
      [
        {
          text: "DRAWN BY / REVISION / PROJECT ADDRESS",
          x: 600,
          y: 420,
          width: 200,
          height: 6,
        },
      ],
      surveyPixels(300, 200, pixels(true)),
    ),
  ).toEqual([]);
});
it("oversized crossing labels warn rather than silently reducing drawing resolution", () => {
  const regions = contentRegions(
    1,
    5000,
    1200,
    [
      {
        text: "BEAM CONNECTION NOTES",
        x: 1600,
        y: 420,
        width: 2500,
        height: 6,
      },
    ],
    surveyPixels(300, 200, pixels(true)),
  );
  expect(
    regions.some((r) => r.inspectionNote?.includes("safe crop limit")),
  ).toBe(true);
});

it("overlapping construction callouts yield one useful physical crop after context expansion", () => {
  const marks = [
    { text: "BEAM CONNECTION NOTES", x: 600, y: 420, width: 520, height: 6 },
    {
      text: "JOIST HANGER SPECIFICATION",
      x: 610,
      y: 435,
      width: 500,
      height: 6,
    },
  ];
  const crops = selectDetailRegions(
    contentRegions(1, 1800, 1200, marks, surveyPixels(300, 200, pixels(true))),
  );
  expect(crops).toHaveLength(1);
  for (const mark of marks) {
    expect(crops[0].x).toBeLessThanOrEqual(mark.x);
    expect(crops[0].x + crops[0].width).toBeGreaterThanOrEqual(
      mark.x + mark.width,
    );
  }
});

it("isolated small construction notes are not forced into a tall mostly blank minimum crop", () => {
  const data = pixels();
  for (let y = 70; y < 72; y++)
    for (let x = 100; x < 120; x++) {
      const i = (y * 300 + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  const crops = selectDetailRegions(
    contentRegions(
      1,
      1800,
      1200,
      [{ text: "JOIST NOTES", x: 600, y: 420, width: 120, height: 6 }],
      surveyPixels(300, 200, data),
    ),
  );
  expect(crops).toHaveLength(1);
  expect(crops[0].height).toBeLessThan(70);
  expect(crops[0].width).toBeGreaterThanOrEqual(120);
});
