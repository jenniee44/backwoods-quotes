// Proposed drawing facts, scoped to the parent physical assembly. Never approvals.
export const materialInputUnits = {
  layoutLength: "ft",
  layoutWidth: "ft",
  memberLength: "ft",
  spacing: "in",
  count: "each",
  boardWidth: "in",
  gap: "in",
  stock: "ft",
  pieces: "each",
  waste: "%",
  kerf: "in",
  diameter: "in",
  depth: "in",
  padLength: "in",
  padWidth: "in",
  connections: "each",
  piecesPerConnection: "each",
  linearLength: "ft",
  direction: "option",
  edgeIncluded: "option",
  layoutClear: "option",
  plies: "each",
} as const;
export const materialInputFields = Object.keys(
  materialInputUnits,
) as (keyof typeof materialInputUnits)[];
export type MaterialInput = {
  field: keyof typeof materialInputUnits;
  value: number;
  unit: "ft" | "in" | "each" | "%" | "option";
  page: number | null;
  evidence: string;
  readable: boolean;
};
export const materialInputSchema = {
  type: "array",
  maxItems: 40,
  description:
    "Explicitly associated measurements/counts for THIS physical assembly only. Empty when absent. Never infer member length from nearby dimensions, layout rules or image scaling. Proposed, not contractor-verified.",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      field: { type: "string", enum: materialInputFields },
      value: { type: "number", minimum: 0, maximum: 1000000 },
      unit: { type: "string", enum: ["ft", "in", "each", "%", "option"] },
      page: { type: ["integer", "null"], minimum: 1, maximum: 50 },
      evidence: { type: "string", maxLength: 1000 },
      readable: { type: "boolean" },
    },
    required: ["field", "value", "unit", "page", "evidence", "readable"],
  },
};
export function validMaterialInputs(value: unknown): value is MaterialInput[] {
  return (
    Array.isArray(value) &&
    value.length <= 40 &&
    value.every(
      (v) =>
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v).every((k) =>
          ["field", "value", "unit", "page", "evidence", "readable"].includes(
            k,
          ),
        ) &&
        materialInputFields.includes(v.field) &&
        Number.isFinite(v.value) &&
        v.value >= 0 &&
        v.value <= 1000000 &&
        ["ft", "in", "each", "%", "option"].includes(v.unit) &&
        (v.page === null ||
          (Number.isInteger(v.page) && v.page >= 1 && v.page <= 50)) &&
        typeof v.evidence === "string" &&
        v.evidence.trim().length > 0 &&
        v.evidence.length <= 1000 &&
        typeof v.readable === "boolean",
    )
  );
}
const uncertain =
  /unreadable|illegible|uncertain|approx(?:imate)?|assum|conflict|not confirmed|to confirm|unknown|scaled|pixel/i;
export function normalizeMaterialInput(f: MaterialInput) {
  const expected = materialInputUnits[f.field];
  if (f.unit === expected) return f.value;
  if (expected === "ft" && f.unit === "in") return f.value / 12;
  if (expected === "in" && f.unit === "ft") return f.value * 12;
  return NaN;
}
export function resolveMaterialInputs(facts: MaterialInput[] = []) {
  const values: Partial<Record<MaterialInput["field"], number>> = {};
  const conflicts: string[] = [];
  for (const field of materialInputFields) {
    const group = facts.filter((v) => v.field === field);
    if (!group.length) continue;
    const normalized = group.map(normalizeMaterialInput);
    const expected = materialInputUnits[field];
    if (
      group.some(
        (v) => !v.readable || v.page === null || uncertain.test(v.evidence),
      ) ||
      normalized.some(
        (v) =>
          !Number.isFinite(v) ||
          (expected === "each" && !Number.isInteger(v)) ||
          (expected === "option" && ![0, 1].includes(v)),
      ) ||
      new Set(normalized).size !== 1
    )
      conflicts.push(field);
    else values[field] = normalized[0];
  }
  return { values, conflicts };
}
export function materialInputProblem(facts: MaterialInput[] = []) {
  return resolveMaterialInputs(facts).conflicts.length
    ? "Reconcile conflicting, unreadable or unconfirmed drawing inputs before approval."
    : "";
}
export function materialInputIdentity(facts: MaterialInput[] = []) {
  return JSON.stringify(
    [
      ...new Set(
        facts.map((v) =>
          JSON.stringify([
            v.field,
            Number.isFinite(normalizeMaterialInput(v))
              ? normalizeMaterialInput(v)
              : [v.unit, v.value],
            v.readable,
          ]),
        ),
      ),
    ].sort(),
  );
}
export function mergeMaterialInputs(
  a: MaterialInput[] = [],
  b: MaterialInput[] = [],
) {
  return [...new Map([...a, ...b].map((v) => [JSON.stringify(v), v])).values()];
}
