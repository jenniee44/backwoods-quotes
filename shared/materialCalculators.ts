import { beamStockGroups } from "./beamLumber";
export type CalculatorField = {
  run?: number;
  key: string;
  label: string;
  integer?: boolean;
  zero?: boolean;
  options?: { value: number; label: string }[];
};
export type MaterialCalculation = {
  kind: string;
  inputs: Record<string, number | null>;
  verified: boolean;
  arrangements?: Record<string, string>;
  specifications?: Record<string, string>;
  lengthSources?: Record<string, string>;
  specificationSources?: Record<string, string>;
  runLabels?: Record<string, string>;
  availableStock?: number[];
  runCountSource?: string;
  inputSources?: Record<string, string>;
  geometryConfirmed?: boolean;
};
const f = (
  key: string,
  label: string,
  extra: Partial<CalculatorField> = {},
): CalculatorField => ({ key, label, ...extra });
const waste = f("waste", "Waste allowance (%)", { zero: true });
const length = f("length", "Verified layout length (ft)");
const width = f("width", "Verified width (ft)");
const stock = f("stock", "Selected stock length (ft)");
const count = f("count", "Verified component count", { integer: true });
const direction = f("direction", "Installation direction", {
  zero: true,
  options: [
    { value: 0, label: "Along layout length" },
    { value: 1, label: "Along layout width" },
  ],
});
// Each section/run is calculated separately. No automatic engineering or cross-run offcut reuse.
const cutStock = (v: Record<string, number>) =>
  Math.ceil(
    (v.count / Math.floor((v.stock * 12 + v.kerf) / (v.member * 12 + v.kerf))) *
      (1 + v.waste / 100),
  );
const cutFields = [
  count,
  f("member", "Verified cut length (ft)"),
  stock,
  f("kerf", "Saw kerf / cutting loss (in)", { zero: true }),
  waste,
];
export const calculators = [
  {
    kind: "beam-runs",
    name: "Beams — individual verified runs",
    unit: "boards",
    fields: [
      f("runs", "Number of separate beam runs", { integer: true }),
      waste,
      ...Array.from({ length: 20 }, (_, i) => {
        const n = i + 1;
        return [
          f("length" + n, `Run ${n} length (ft)`, { run: n }),
          f("plies" + n, `Run ${n} plies`, { run: n, integer: true }),
          f("stock" + n, `Run ${n} stock board length (ft)`, { run: n }),
          f("pieces" + n, `Run ${n} approved pieces per ply`, {
            run: n,
            integer: true,
          }),
          f("layout" + n, `Run ${n} cut / splice arrangement`, {
            run: n,
            options: [
              {
                value: 1,
                label: "Confirmed against approved construction requirements",
              },
            ],
          }),
        ];
      }).flat(),
    ],
    formula:
      "sum(ceil(each specification/stock group's boards × (1 + waste / 100))); no offcut reuse or structural splice design is inferred",
    run: (v: Record<string, number>) =>
      beamStockGroups({ kind: "beam-runs", inputs: v, verified: true }).reduce(
        (sum, g) => sum + g.quantity,
        0,
      ),
  },
  {
    kind: "decking-layout",
    name: "Deck boards — directional row / cut layout",
    unit: "boards",
    fields: [
      length,
      width,
      direction,
      f("boardWidth", "Actual board width (in)"),
      f("gap", "Selected board gap (in)", { zero: true }),
      stock,
      f("kerf", "Saw kerf / cutting loss (in)", { zero: true }),
      f("pieces", "Contractor-approved pieces per row", { integer: true }),
      waste,
    ],
    formula:
      "rows = ceil((cross-run × 12 + gap) / (actual width + gap)); cut length = run / pieces; cuts per stock = floor((stock × 12 + kerf) / (cut length × 12 + kerf)); purchase = ceil(rows × pieces / cuts per stock × (1 + waste / 100))",
    run: (v: Record<string, number>) => {
      const run = v.direction === 0 ? v.length : v.width;
      const cross = v.direction === 0 ? v.width : v.length;
      const rows = Math.ceil((cross * 12 + v.gap) / (v.boardWidth + v.gap));
      return cutStock({ ...v, count: rows * v.pieces, member: run / v.pieces });
    },
  },
  {
    kind: "post-stock",
    name: "Posts — verified cut-stock purchase",
    unit: "posts",
    fields: cutFields,
    formula:
      "ceil(count / floor((stock × 12 + kerf) / (cut length × 12 + kerf)) × (1 + waste / 100))",
    run: cutStock,
  },
  ...["Ledger", "Rim joist", "Blocking", "Fascia", "Stair riser"].map(
    (name) => ({
      kind: name.toLowerCase().replace(/ /g, "-"),
      name: `${name} — verified cut-stock purchase`,
      unit: "boards",
      fields: cutFields,
      formula:
        "ceil(count / floor((stock × 12 + kerf) / (cut length × 12 + kerf)) × (1 + waste / 100))",
      run: cutStock,
    }),
  ),
  {
    kind: "rectangular-concrete",
    name: "Rectangular footing / pad concrete volume",
    unit: "cu yd",
    fields: [
      count,
      f("padLength", "Verified pad length (in)"),
      f("padWidth", "Verified pad width (in)"),
      f("depth", "Verified concrete depth (in)"),
      waste,
    ],
    formula:
      "count × pad length × pad width × depth / 46656 × (1 + waste / 100)",
    run: (v: Record<string, number>) =>
      ((v.count * v.padLength * v.padWidth * v.depth) / 46656) *
      (1 + v.waste / 100),
  },
  {
    kind: "hardware",
    name: "Hardware / connectors — verified assembly schedule",
    unit: "each",
    fields: [
      count,
      f("pieces", "Verified connectors per assembly", { integer: true }),
      waste,
    ],
    formula:
      "ceil(verified assembly count × connectors per assembly × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(v.count * v.pieces * (1 + v.waste / 100)),
  },
  {
    kind: "area",
    name: "Deck / rectangular surface area",
    unit: "sq ft",
    fields: [length, width, waste],
    formula: "length × width × (1 + waste / 100)",
    run: (v: Record<string, number>) =>
      v.length * v.width * (1 + v.waste / 100),
  },
  {
    kind: "decking",
    name: "Decking boards (verified layout)",
    unit: "boards",
    fields: [
      length,
      width,
      stock,
      f("coverage", "Effective board coverage including gap (in)"),
      waste,
    ],
    formula:
      "ceil(length × width ÷ (stock length × coverage / 12) × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(
        ((v.length * v.width) / ((v.stock * v.coverage) / 12)) *
          (1 + v.waste / 100),
      ),
  },
  {
    kind: "joists",
    name: "Joists (both ends included)",
    unit: "boards",
    fields: [
      length,
      f("spacing", "Verified joist spacing (in)"),
      f("member", "Required continuous joist length (ft)"),
      stock,
      waste,
    ],
    formula:
      "ceil((ceil(layout length × 12 / spacing) + 1) × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(
        (Math.ceil((v.length * 12) / v.spacing) + 1) * (1 + v.waste / 100),
      ),
  },
  {
    kind: "beams",
    name: "Beam stock (contractor-defined cut/splice layout)",
    unit: "boards",
    fields: [
      count,
      f("plies", "Verified plies per beam", { integer: true }),
      f("segments", "Approved stock pieces per ply", { integer: true }),
      f("member", "Required beam run length (ft)"),
      stock,
      waste,
    ],
    formula:
      "ceil(beam count × plies × approved pieces per ply × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(v.count * v.plies * v.segments * (1 + v.waste / 100)),
  },
  {
    kind: "posts",
    name: "Posts / footing assemblies (verified count)",
    unit: "each",
    fields: [count, waste],
    formula: "ceil(verified count × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(v.count * (1 + v.waste / 100)),
  },
  {
    kind: "concrete",
    name: "Round footing concrete volume",
    unit: "cu yd",
    fields: [
      count,
      f("diameter", "Verified footing diameter (in)"),
      f("depth", "Verified concrete depth (in)"),
      waste,
    ],
    formula:
      "count × π × (diameter / 24)² × (depth / 12) / 27 × (1 + waste / 100)",
    run: (v: Record<string, number>) =>
      ((v.count * Math.PI * (v.diameter / 24) ** 2 * (v.depth / 12)) / 27) *
      (1 + v.waste / 100),
  },
  {
    kind: "railing",
    name: "Railing / trim linear footage",
    unit: "linear ft",
    fields: [length, waste],
    formula: "verified length × (1 + waste / 100)",
    run: (v: Record<string, number>) => v.length * (1 + v.waste / 100),
  },
  {
    kind: "treads",
    name: "Stair tread boards",
    unit: "boards",
    fields: [
      f("count", "Verified tread count", { integer: true }),
      f("pieces", "Verified boards per tread", { integer: true }),
      f("member", "Required tread board length (ft)"),
      stock,
      waste,
    ],
    formula:
      "ceil(verified tread count × boards per tread × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(v.count * v.pieces * (1 + v.waste / 100)),
  },
  {
    kind: "stringers",
    name: "Stair stringers (verified spacing/layout)",
    unit: "boards",
    fields: [
      width,
      f("spacing", "Approved stringer spacing (in)"),
      f("member", "Verified cut stringer length (ft)"),
      stock,
      waste,
    ],
    formula: "ceil((ceil(width × 12 / spacing) + 1) × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(
        (Math.ceil((v.width * 12) / v.spacing) + 1) * (1 + v.waste / 100),
      ),
  },
  {
    kind: "studs",
    name: "Wall studs (verified opening/corner adjustments)",
    unit: "each",
    fields: [
      length,
      f("spacing", "Verified stud spacing (in)"),
      f("extra", "Additional corner/jack/header studs", {
        integer: true,
        zero: true,
      }),
      f("removed", "Studs removed for verified openings", {
        integer: true,
        zero: true,
      }),
      f("member", "Required stud length (ft)"),
      stock,
      waste,
    ],
    formula:
      "ceil((ceil(length × 12 / spacing) + 1 + extra - removed) × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(
        (Math.ceil((v.length * 12) / v.spacing) + 1 + v.extra - v.removed) *
          (1 + v.waste / 100),
      ),
  },
  {
    kind: "sheets",
    name: "Drywall / sheathing sheets",
    unit: "sheets",
    fields: [
      length,
      width,
      f("openings", "Verified excluded opening area (sq ft)", { zero: true }),
      f("layers", "Required layers", { integer: true }),
      f("coverage", "Usable area per sheet (sq ft)"),
      waste,
    ],
    formula:
      "ceil((length × width - openings) × layers / sheet coverage × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(
        (((v.length * v.width - v.openings) * v.layers) / v.coverage) *
          (1 + v.waste / 100),
      ),
  },
  {
    kind: "coverage",
    name: "Flooring / renovation packaged material",
    unit: "packages",
    fields: [
      length,
      width,
      f("openings", "Verified excluded area (sq ft)", { zero: true }),
      f("coverage", "Verified coverage per package (sq ft)"),
      waste,
    ],
    formula:
      "ceil((length × width - exclusions) / package coverage × (1 + waste / 100))",
    run: (v: Record<string, number>) =>
      Math.ceil(
        ((v.length * v.width - v.openings) / v.coverage) * (1 + v.waste / 100),
      ),
  },
];
/** Show/require inputs only for the explicitly selected individual runs. */
export function activeCalculatorFields(
  definition: { fields: CalculatorField[] },
  recipe: MaterialCalculation,
) {
  return definition.fields.filter(
    (field) => !field.run || field.run <= (recipe.inputs.runs ?? 0),
  );
}
export function validCalculation(value: unknown): value is MaterialCalculation {
  if (!value || typeof value !== "object") return false;
  const v = value as MaterialCalculation;
  const definition = calculators.find((d) => d.kind === v.kind);
  return (
    !!definition &&
    typeof v.verified === "boolean" &&
    !!v.inputs &&
    typeof v.inputs === "object" &&
    !Array.isArray(v.inputs) &&
    Object.keys(v.inputs).every((key) =>
      definition.fields.some((f) => f.key === key),
    ) &&
    (v.runCountSource === undefined ||
      (typeof v.runCountSource === "string" &&
        v.runCountSource.length <= 2000)) &&
    (v.geometryConfirmed === undefined ||
      typeof v.geometryConfirmed === "boolean") &&
    (v.inputSources === undefined ||
      (v.inputSources !== null &&
        typeof v.inputSources === "object" &&
        !Array.isArray(v.inputSources) &&
        Object.entries(v.inputSources).every(
          ([key, source]) =>
            definition.fields.some((f) => f.key === key) &&
            typeof source === "string" &&
            source.length <= 2000,
        ))) &&
    (v.availableStock === undefined ||
      (Array.isArray(v.availableStock) &&
        v.availableStock.length <= 20 &&
        v.availableStock.every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1000,
        ))) &&
    [v.specificationSources, v.runLabels].every(
      (value) =>
        value === undefined ||
        (value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.entries(value).every(
            ([key, text]) =>
              /^(?:[1-9]|1[0-9]|20)$/.test(key) &&
              typeof text === "string" &&
              text.length <= 2000,
          )),
    ) &&
    (v.lengthSources === undefined ||
      (v.lengthSources !== null &&
        typeof v.lengthSources === "object" &&
        !Array.isArray(v.lengthSources) &&
        Object.entries(v.lengthSources).every(
          ([key, text]) =>
            /^(?:[1-9]|1[0-9]|20)$/.test(key) &&
            typeof text === "string" &&
            text.length <= 2000,
        ))) &&
    (v.specifications === undefined ||
      (v.specifications !== null &&
        typeof v.specifications === "object" &&
        !Array.isArray(v.specifications) &&
        Object.entries(v.specifications).every(
          ([key, text]) =>
            /^(?:[1-9]|1[0-9]|20)$/.test(key) &&
            typeof text === "string" &&
            text.length <= 300,
        ))) &&
    (v.arrangements === undefined ||
      (typeof v.arrangements === "object" &&
        v.arrangements !== null &&
        !Array.isArray(v.arrangements) &&
        Object.entries(v.arrangements).every(
          ([key, text]) =>
            /^(?:[1-9]|1[0-9]|20)$/.test(key) &&
            typeof text === "string" &&
            text.length <= 2000,
        ))) &&
    Object.values(v.inputs).every(
      (n) =>
        n === null ||
        (typeof n === "number" &&
          Number.isFinite(n) &&
          n >= 0 &&
          n <= 1_000_000),
    )
  );
}
export function calculateMaterial(
  recipe: MaterialCalculation,
  requireVerified = true,
) {
  const definition = calculators.find((d) => d.kind === recipe.kind);
  if (!definition || !validCalculation(recipe))
    return {
      quantity: null,
      unit: "",
      formula: "",
      missing: ["Choose a valid calculator and inputs"],
      steps: [] as string[],
    };
  const missing = activeCalculatorFields(definition, recipe)
    .filter(
      (f) =>
        recipe.inputs[f.key] === null ||
        recipe.inputs[f.key] === undefined ||
        (!f.zero && recipe.inputs[f.key]! <= 0) ||
        (f.integer && !Number.isInteger(recipe.inputs[f.key])) ||
        (f.options && !f.options.some((o) => o.value === recipe.inputs[f.key])),
    )
    .map((f) => f.label);
  const v = recipe.inputs as Record<string, number>;
  if (recipe.geometryConfirmed === false)
    missing.push(
      "Confirm the regular layout boundary, openings and required edge members before calculating",
    );
  if (recipe.kind === "beam-runs") {
    if (!Number.isInteger(v.runs) || v.runs < 1 || v.runs > 20)
      missing.push("Enter between 1 and 20 separate beam runs");
    for (let n = 1; n <= Math.min(v.runs ?? 0, 20); n++) {
      if (v["pieces" + n] * v["stock" + n] < v["length" + n])
        missing.push(
          `Run ${n}: approved stock arrangement does not cover the run length`,
        );
      if (
        recipe.specifications &&
        String(n) in recipe.specifications &&
        (!recipe.specifications[String(n)].trim() ||
          /unreadable|illegible|unknown|to confirm|not specified|\btbd\b|\btbc\b/i.test(
            recipe.specifications[String(n)],
          ))
      )
        missing.push(`Beam ${n}: confirm lumber specification`);
      if (!recipe.arrangements?.[String(n)]?.trim())
        missing.push(
          `Run ${n}: record the verified cutting / splice arrangement`,
        );
      if (v["layout" + n] !== 1)
        missing.push(
          `Run ${n}: confirm the cutting and structural splice arrangement; it is never inferred`,
        );
    }
  }
  if (recipe.kind === "decking-layout") {
    const run = v.direction === 0 ? v.length : v.width;
    if (v.stock < run / v.pieces)
      missing.push(
        "Selected stock is too short for the approved equal-piece row layout",
      );
    if (v.boardWidth > 24 || v.gap > v.boardWidth || v.kerf > 1)
      missing.push("Check actual board width, gap and saw kerf in inches");
  }
  if (
    [
      "post-stock",
      "ledger",
      "rim-joist",
      "blocking",
      "fascia",
      "stair-riser",
    ].includes(recipe.kind)
  ) {
    if (v.stock < v.member)
      missing.push("Stock must cover the verified continuous cut length");
    if (v.kerf > 1) missing.push("Check saw kerf in inches");
  }
  if (v.waste > 100) missing.push("Waste allowance must be between 0 and 100%");
  if (
    ["joists", "treads", "stringers", "studs"].includes(recipe.kind) &&
    v.stock < v.member
  )
    missing.push("Stock must cover the verified continuous member length");
  if (recipe.kind === "beams" && v.segments * v.stock < v.member)
    missing.push(
      "Approved beam cut/splice layout does not cover the run length",
    );
  if (
    ["sheets", "coverage"].includes(recipe.kind) &&
    v.openings >= v.length * v.width
  )
    missing.push("Exclusions must be smaller than the surface area");
  if (requireVerified && !recipe.verified)
    missing.push("Verify all inputs, specifications and layout");
  const amount = missing.length
    ? null
    : recipe.kind === "beam-runs"
      ? beamStockGroups(recipe).reduce((sum, g) => sum + g.quantity, 0)
      : definition.run(v);
  if (
    amount !== null &&
    (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
  )
    missing.push("Calculated result is outside the supported range");
  const steps: string[] = [];
  if (!missing.length && recipe.kind === "beam-runs") {
    for (let n = 1; n <= v.runs; n++)
      steps.push(
        `Run ${n}: ${v["length" + n]} ft, ${v["plies" + n]} plies × ${v["pieces" + n]} confirmed pieces at ${v["stock" + n]} ft = ${v["plies" + n] * v["pieces" + n]} boards before waste. No cross-run offcut reuse.`,
      );
  }
  if (!missing.length && recipe.kind === "decking-layout") {
    const run = v.direction === 0 ? v.length : v.width;
    const cross = v.direction === 0 ? v.width : v.length;
    const rows = Math.ceil((cross * 12 + v.gap) / (v.boardWidth + v.gap));
    const cut = run / v.pieces;
    const cutsPerStock = Math.floor(
      (v.stock * 12 + v.kerf) / (cut * 12 + v.kerf),
    );
    steps.push(
      `${rows} rows across ${cross} ft; ${v.pieces} equal pieces per row; ${rows * v.pieces} cuts at ${Number(cut.toFixed(6))} ft.`,
      `${cutsPerStock} cuts per ${v.stock} ft stock board; ${v.waste}% waste allowance; ${amount} boards to purchase.`,
    );
  }
  if (
    !missing.length &&
    [
      "post-stock",
      "ledger",
      "rim-joist",
      "blocking",
      "fascia",
      "stair-riser",
    ].includes(recipe.kind)
  ) {
    const cuts = Math.floor((v.stock * 12 + v.kerf) / (v.member * 12 + v.kerf));
    steps.push(
      `${v.count} cuts at ${v.member} ft; ${cuts} cuts per ${v.stock} ft stock piece including ${v.kerf} in kerf; ${v.waste}% waste.`,
    );
  }
  return {
    quantity: missing.length ? null : amount,
    unit: definition.unit,
    formula: definition.formula,
    missing,
    steps,
  };
}
