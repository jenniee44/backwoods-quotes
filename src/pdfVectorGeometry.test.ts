import { expect, it } from "vitest";
import { vectorGeometry } from "./pdfVectorGeometry";
import { validVectorGeometry } from "../shared/pdfVectorGeometry";
const ops = {
  stroke: 20,
  save: 1,
  restore: 2,
  transform: 3,
  constructPath: 4,
  clip: 5,
  eoClip: 6,
  paintFormXObjectBegin: 7,
  paintFormXObjectEnd: 8,
};
const viewport = { width: 1000, height: 1000, transform: [1, 0, 0, 1, 0, 0] };
const labels = [0.3, 0.5, 0.7].flatMap((y) =>
  [0.3, 0.5, 0.7].map((x) => ({
    text: "3PLY 2X10 PT",
    x,
    y: y - 0.01,
    width: 0.1,
    height: 0.006,
    angle: 0,
  })),
);
const path = (y: number) => [0, 200, y, 1, 800, y];
it("extracts different numbers of continuous parallel drawing lines independently of repeated label frequency", () => {
  for (const count of [1, 2, 3, 4]) {
    const ys = [300, 500, 700, 900].slice(0, count);
    const result = vectorGeometry(
      {
        fnArray: ys.map(() => 4),
        argsArray: ys.map((y) => [20, [new Float32Array(path(y))]]),
      },
      ops,
      viewport,
      [...labels, { ...labels[0], y: 0.89 }],
    );
    expect(result.segments).toHaveLength(count);
    expect(validVectorGeometry(result)).toBe(true);
    expect(result).not.toHaveProperty("beamCount");
    expect(result).not.toHaveProperty("quantity");
  }
});
it("maps saved graphics transforms and quarter-turn viewports into original-page coordinates", () => {
  const result = vectorGeometry(
    {
      fnArray: [1, 3, 4, 2],
      argsArray: [[], [1, 0, 0, 1, 0, 100], [20, [path(200)]], []],
    },
    ops,
    { ...viewport, transform: [0, 1, -1, 0, 1000, 0] },
    [{ ...labels[0], x: 0.69, y: 0.3, width: 0.01 }],
  );
  expect(result.segments[0]).toEqual([0.7, 0.2, 0.7, 0.8]);
});
it("does not guess clipped, form-local or curved linework and does not infer geometry from text alone", () => {
  expect(
    vectorGeometry({ fnArray: [], argsArray: [] }, ops, viewport, labels)
      .segments,
  ).toEqual([]);
  expect(
    vectorGeometry(
      { fnArray: [5, 4], argsArray: [[], [20, [path(300)]]] },
      ops,
      viewport,
      labels,
    ).segments,
  ).toEqual([]);
  expect(
    vectorGeometry(
      { fnArray: [7, 4, 8], argsArray: [[], [20, [path(300)]], []] },
      ops,
      viewport,
      labels,
    ).segments,
  ).toEqual([]);
});
it("bounds and validates geometry metadata, rejecting injected fields and malformed coordinates", () => {
  const result = vectorGeometry(
    {
      fnArray: Array(200).fill(4),
      argsArray: Array.from({ length: 200 }, (_, i) => [
        20,
        [path(280 + i / 10)],
      ]),
    },
    ops,
    viewport,
    labels,
  );
  expect(result.truncated).toBe(true);
  expect(result.segments.length).toBeLessThanOrEqual(160);
  expect(validVectorGeometry({ ...result, secret: "no" })).toBe(false);
  expect(validVectorGeometry({ ...result, segments: [[NaN, 0, 1, 1]] })).toBe(
    false,
  );
  expect(validVectorGeometry({ ...result, segments: [[0, 0, 2, 1]] })).toBe(
    false,
  );
});
it("preserves nearby closed-path symbol geometry without classifying it as posts or footings", () => {
  const result = vectorGeometry(
    {
      fnArray: [4, 4],
      argsArray: [
        [20, [path(300)]],
        [20, [[0, 195, 295, 1, 205, 295, 1, 205, 305, 1, 195, 305, 4]]],
      ],
    },
    ops,
    viewport,
    labels,
  );
  expect(result.boxes).toEqual([[0.195, 0.295, 0.205, 0.305]]);
  expect(result).not.toHaveProperty("supports");
});
it("retains short connected spans beyond the only beam label without creating beam counts or inferred bridges", () => {
  const segments = [
    [200, 300, 250, 300],
    [250, 300, 300, 300],
    [300, 300, 350, 300],
    [600, 300, 650, 300],
    [250, 320, 300, 320],
  ];
  const result = vectorGeometry(
    {
      fnArray: segments.map(() => 4),
      argsArray: segments.map(([x, y, z, w]) => [20, [[0, x, y, 1, z, w]]]),
    },
    ops,
    viewport,
    [{ ...labels[0], x: 0.2, width: 0.01 }],
  );
  expect(result.segments).toContainEqual([0.3, 0.3, 0.35, 0.3]);
  expect(result.segments).not.toContainEqual([0.6, 0.3, 0.65, 0.3]);
  expect(result).not.toHaveProperty("beamCount");
});
it("includes labelled joist linework as unclassified geometry for component interpretation", () => {
  const result = vectorGeometry(
    { fnArray: [4], argsArray: [[20, [path(300)]]] },
    ops,
    viewport,
    [{ ...labels[0], text: '2x6 PT joists at 16" OC' }],
  );
  expect(result.segments).toHaveLength(1);
});

it("duplicate/reversed drawing strokes do not consume the geometry budget and hide other physical lines", () => {
  const result = vectorGeometry(
    {
      fnArray: Array(203).fill(4),
      argsArray: [
        ...Array.from({ length: 200 }, (_, i) => [
          20,
          [[0, i % 2 ? 800 : 200, 300, 1, i % 2 ? 200 : 800, 300]],
        ]),
        [20, [path(500)]],
        [20, [path(700)]],
        [20, [path(900)]],
      ],
    },
    ops,
    viewport,
    [...labels, { ...labels[0], y: 0.89 }],
  );
  expect(result.segments).toHaveLength(4);
  expect(result.truncated).toBe(false);
});
