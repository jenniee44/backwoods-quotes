export type CalculatorField = {
  key: string;
  label: string;
  integer?: boolean;
  zero?: boolean;
};
export type MaterialCalculation = {
  kind: string;
  inputs: Record<string, number | null>;
  verified: boolean;
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
export const calculators = [
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
    };
  const missing = definition.fields
    .filter(
      (f) =>
        recipe.inputs[f.key] === null ||
        recipe.inputs[f.key] === undefined ||
        (!f.zero && recipe.inputs[f.key]! <= 0) ||
        (f.integer && !Number.isInteger(recipe.inputs[f.key])),
    )
    .map((f) => f.label);
  const v = recipe.inputs as Record<string, number>;
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
  const amount = missing.length ? null : definition.run(v);
  if (
    amount !== null &&
    (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
  )
    missing.push("Calculated result is outside the supported range");
  return {
    quantity: missing.length ? null : amount,
    unit: definition.unit,
    formula: definition.formula,
    missing,
  };
}
