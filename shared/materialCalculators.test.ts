import { it, expect } from "vitest";
import {
  calculateMaterial,
  calculators,
  validCalculation,
} from "./materialCalculators";
const cases: [string, Record<string, number>, number][] = [
  ["area", { length: 20, width: 12, waste: 10 }, 264],
  [
    "decking",
    { length: 20, width: 12, stock: 12, coverage: 5.5, waste: 10 },
    48,
  ],
  ["joists", { length: 20, spacing: 16, member: 12, stock: 12, waste: 10 }, 18],
  [
    "beams",
    { count: 2, plies: 3, segments: 2, member: 20, stock: 10, waste: 10 },
    14,
  ],
  ["posts", { count: 6, waste: 0 }, 6],
  ["concrete", { count: 4, diameter: 12, depth: 48, waste: 0 }, Math.PI / 6.75],
  ["railing", { length: 40, waste: 10 }, 44],
  ["treads", { count: 10, pieces: 2, member: 4, stock: 8, waste: 10 }, 22],
  ["stringers", { width: 4, spacing: 16, member: 14, stock: 16, waste: 10 }, 5],
  [
    "studs",
    {
      length: 20,
      spacing: 16,
      extra: 4,
      removed: 3,
      member: 8,
      stock: 8,
      waste: 10,
    },
    19,
  ],
  [
    "sheets",
    { length: 40, width: 8, openings: 20, layers: 1, coverage: 32, waste: 10 },
    11,
  ],
  [
    "coverage",
    { length: 20, width: 12, openings: 20, coverage: 22, waste: 10 },
    11,
  ],
];
it.each(cases)(
  "%s calculates a known verified construction case",
  (kind, inputs, expected) => {
    const result = calculateMaterial({ kind, inputs, verified: true });
    expect(result.quantity).toBeCloseTo(expected, 8);
    expect(result.formula).toBeTruthy();
    expect(result.missing).toEqual([]);
  },
);
cases.push(
  [
    "decking-layout",
    {
      length: 20,
      width: 12,
      direction: 0,
      boardWidth: 5.5,
      gap: 0.125,
      stock: 20,
      kerf: 0.125,
      pieces: 1,
      waste: 0,
    },
    26,
  ],
  ...[
    "post-stock",
    "ledger",
    "rim-joist",
    "blocking",
    "fascia",
    "stair-riser",
  ].map((kind): [string, Record<string, number>, number] => [
    kind,
    { count: 6, member: 4, stock: 8, kerf: 0, waste: 0 },
    3,
  ]),
  [
    "rectangular-concrete",
    { count: 1, padLength: 36, padWidth: 36, depth: 36, waste: 0 },
    1,
  ],
  ["hardware", { count: 6, pieces: 2, waste: 0 }, 12],
);
it.each(calculators)(
  "$kind leaves unknown dimensions/waste as contractor input",
  ({ kind }) => {
    expect(
      calculateMaterial({ kind, inputs: {}, verified: true }).quantity,
    ).toBeNull();
    const good = cases.find((c) => c[0] === kind)!;
    expect(
      calculateMaterial({ kind, inputs: good[1], verified: false }).quantity,
    ).toBeNull();
    expect(
      calculateMaterial({ kind, inputs: good[1], verified: false }, false)
        .quantity,
    ).not.toBeNull();
  },
);
it("rejects unsafe inputs, short stock, unsupported splices and impossible exclusions", () => {
  expect(
    validCalculation({ kind: "unknown", inputs: {}, verified: true }),
  ).toBe(false);
  expect(
    validCalculation({
      kind: "area",
      inputs: { length: Infinity },
      verified: true,
    }),
  ).toBe(false);
  for (const [kind, inputs] of cases) {
    expect(
      calculateMaterial({
        kind,
        inputs: { ...inputs, waste: 101 },
        verified: true,
      }).quantity,
    ).toBeNull();
  }
  expect(
    calculateMaterial({
      kind: "joists",
      inputs: { ...cases[2][1], stock: 8 },
      verified: true,
    }).quantity,
  ).toBeNull();
  expect(
    calculateMaterial({
      kind: "beams",
      inputs: { ...cases[3][1], segments: 1 },
      verified: true,
    }).quantity,
  ).toBeNull();
  expect(
    calculateMaterial({
      kind: "sheets",
      inputs: { ...cases[10][1], openings: 500 },
      verified: true,
    }).quantity,
  ).toBeNull();
  expect(
    calculateMaterial({
      kind: "posts",
      inputs: { count: 2.5, waste: 0 },
      verified: true,
    }).quantity,
  ).toBeNull();
});

it("directional deck rows use actual width, gap and approved stock cuts", () => {
  const inputs = {
    length: 20,
    width: 12,
    direction: 0,
    boardWidth: 5.5,
    gap: 0.125,
    stock: 10,
    kerf: 0.125,
    pieces: 2,
    waste: 10,
  };
  expect(
    calculateMaterial({ kind: "decking-layout", inputs, verified: true })
      .quantity,
  ).toBe(58);
  expect(
    calculateMaterial({
      kind: "decking-layout",
      inputs: { ...inputs, pieces: 1 },
      verified: true,
    }).quantity,
  ).toBeNull();
  expect(
    calculateMaterial({
      kind: "decking-layout",
      inputs: { ...inputs, direction: 1, stock: 12, pieces: 1, waste: 0 },
      verified: true,
    }).quantity,
  ).toBe(43);
  expect(
    calculateMaterial({
      kind: "decking-layout",
      inputs: { ...inputs, direction: 2 },
      verified: true,
    }).quantity,
  ).toBeNull();
});
it.each([
  "post-stock",
  "ledger",
  "rim-joist",
  "blocking",
  "fascia",
  "stair-riser",
])("%s accounts for stock cuts and kerf without assuming splices", (kind) => {
  const inputs = { count: 12, member: 4, stock: 8, kerf: 0.125, waste: 0 };
  expect(calculateMaterial({ kind, inputs, verified: true }).quantity).toBe(12);
  expect(
    calculateMaterial({ kind, inputs: { ...inputs, kerf: 0 }, verified: true })
      .quantity,
  ).toBe(6);
  expect(
    calculateMaterial({ kind, inputs: { ...inputs, stock: 3 }, verified: true })
      .quantity,
  ).toBeNull();
});
it("rectangular footing volume and hardware require verified schedules", () => {
  expect(
    calculateMaterial({
      kind: "rectangular-concrete",
      inputs: { count: 6, padLength: 24, padWidth: 24, depth: 12, waste: 10 },
      verified: true,
    }).quantity,
  ).toBeCloseTo(0.9777777778);
  expect(
    calculateMaterial({
      kind: "hardware",
      inputs: { count: 12, pieces: 2, waste: 10 },
      verified: true,
    }).quantity,
  ).toBe(27);
});
