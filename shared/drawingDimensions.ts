import { drawingMeasurements } from "./constructionMeasurements";
import type { MaterialInput } from "./materialInputs";
export const dimensionRoles = [
  "Overall",
  "Joist layout width",
  "Member length",
  "Full beam length",
  "Support spacing",
  "Connection count",
  "Deck layout length",
  "Deck layout width",
  "Stair width",
  "Linear material length",
  "Material coverage",
  "Footing geometry",
  "Other",
] as const;
export const dimensionFields = [
  "",
  "layoutLength",
  "layoutWidth",
  "memberLength",
  "spacing",
  "linearLength",
  "count",
  "connections",
  "piecesPerConnection",
  "plies",
  "diameter",
  "depth",
  "boardWidth",
  "gap",
  "padLength",
  "padWidth",
] as const;
export type DrawingDimension = {
  written: string;
  value: number | null;
  unit: "ft" | "in" | "mm" | "each";
  role: (typeof dimensionRoles)[number];
  field: (typeof dimensionFields)[number];
  assemblyRef: string;
  beamLabel: string;
  association: "Explicit" | "Uncertain";
  readable: boolean;
  evidence: string;
  orientation: number;
  region: { x: number; y: number; width: number; height: number };
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
};
const pointSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["x", "y"],
};
export const drawingDimensionsSchema = {
  type: "array",
  maxItems: 40,
  description:
    "Written dimensions/counts, never pixel scaling. Original physical page normalized top-left coordinates even for rotated crops. Preserve readable unassociated dimensions as Uncertain; [] only if none readable.",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      written: { type: "string", maxLength: 200 },
      value: { type: ["number", "null"], minimum: 0, maximum: 1000000 },
      unit: { type: "string", enum: ["ft", "in", "mm", "each"] },
      role: { type: "string", enum: dimensionRoles },
      field: { type: "string", enum: dimensionFields },
      assemblyRef: { type: "string", maxLength: 100 },
      beamLabel: { type: "string", maxLength: 80 },
      association: { type: "string", enum: ["Explicit", "Uncertain"] },
      readable: { type: "boolean" },
      evidence: { type: "string", maxLength: 1000 },
      orientation: { type: "number", minimum: 0, exclusiveMaximum: 360 },
      region: {
        type: "object",
        additionalProperties: false,
        properties: {
          x: { type: "number", minimum: 0, maximum: 1 },
          y: { type: "number", minimum: 0, maximum: 1 },
          width: { type: "number", minimum: 0, maximum: 1 },
          height: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["x", "y", "width", "height"],
      },
      start: pointSchema,
      end: pointSchema,
    },
    required: [
      "written",
      "value",
      "unit",
      "role",
      "field",
      "assemblyRef",
      "beamLabel",
      "association",
      "readable",
      "evidence",
      "orientation",
      "region",
      "start",
      "end",
    ],
  },
};
export function validDrawingDimensions(v: unknown): v is DrawingDimension[] {
  if (!Array.isArray(v) || v.length > 40) return false;
  const point = (p: unknown, nullable = false) => {
    if (p === null) return nullable;
    if (!p || typeof p !== "object") return false;
    const r = p as Record<string, unknown>;
    return (
      Object.keys(r).every((k) => ["x", "y"].includes(k)) &&
      [r.x, r.y].every(
        (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
      )
    );
  };
  return v.every(
    (d) =>
      d &&
      typeof d === "object" &&
      Object.keys(d).every(
        (k) => k in drawingDimensionsSchema.items.properties,
      ) &&
      ["written", "assemblyRef", "beamLabel", "evidence"].every(
        (k) =>
          typeof d[k] === "string" &&
          d[k].length <=
            ({ written: 200, assemblyRef: 100, beamLabel: 80, evidence: 1000 }[
              k
            ] ?? 0),
      ) &&
      (d.value === null ||
        (Number.isFinite(d.value) && d.value >= 0 && d.value <= 1000000)) &&
      ["ft", "in", "mm", "each"].includes(d.unit) &&
      dimensionRoles.includes(d.role) &&
      dimensionFields.includes(d.field) &&
      ["Explicit", "Uncertain"].includes(d.association) &&
      typeof d.readable === "boolean" &&
      Number.isFinite(d.orientation) &&
      d.orientation >= 0 &&
      d.orientation < 360 &&
      d.region &&
      Object.keys(d.region).every((k) =>
        ["x", "y", "width", "height"].includes(k),
      ) &&
      [d.region.x, d.region.y, d.region.width, d.region.height].every(
        (n) => Number.isFinite(n) && n >= 0 && n <= 1,
      ) &&
      d.region.x + d.region.width <= 1.000001 &&
      d.region.y + d.region.height <= 1.000001 &&
      point(d.start, true) &&
      point(d.end, true),
  );
}
export function dimensionValueProblem(d: DrawingDimension) {
  if (
    !d.readable ||
    d.value === null ||
    !d.evidence.trim() ||
    /unreadable|scaled|pixel|assum/i.test(d.evidence)
  )
    return "Measurement is unreadable or unsupported";
  if (d.unit === "each") {
    const label =
      d.field === "connections"
        ? "connections?"
        : d.field === "plies"
          ? "(?:ply|plies)"
          : "(?:connections?|pieces?|plies|posts?|supports?|each)";
    return new RegExp(`^\\s*${d.value}\\s*${label}\\s*$`, "i").test(
      d.written,
    ) && Number.isInteger(d.value)
      ? ""
      : "Written count does not match numeric value or component type";
  }
  const parsed = drawingMeasurements({
    documentId: "",
    page: 1,
    confidence: "Medium",
    sourceFacts: [d.written],
  });
  const inches =
    d.value * (d.unit === "ft" ? 12 : d.unit === "mm" ? 1 / 25.4 : 1);
  return parsed.length === 1 &&
    parsed[0].written.trim() === d.written.trim() &&
    Math.abs(parsed[0].inches - inches) < 1e-5
    ? ""
    : "Written measurement does not match numeric value/units";
}
export type DimensionDecision = {
  documentId: string;
  page: number | null;
  written: string;
  assemblyRef: string;
  field: string;
  status: "Assigned" | "Rejected" | "Unassigned";
  reason: string;
};
export function validDimensionDecisions(v: unknown): v is DimensionDecision[] {
  return (
    Array.isArray(v) &&
    v.length <= 500 &&
    v.every(
      (d) =>
        d &&
        typeof d === "object" &&
        Object.keys(d).every((k) =>
          [
            "documentId",
            "page",
            "written",
            "assemblyRef",
            "field",
            "status",
            "reason",
          ].includes(k),
        ) &&
        ["documentId", "written", "assemblyRef", "field", "reason"].every(
          (k) => typeof d[k] === "string" && d[k].length <= 2000,
        ) &&
        (d.page === null ||
          (Number.isInteger(d.page) && d.page > 0 && d.page <= 50)) &&
        ["Assigned", "Rejected", "Unassigned"].includes(d.status),
    )
  );
}
export function dimensionInput(
  d: DrawingDimension,
  page: number,
): MaterialInput | undefined {
  if (!d.field || d.unit === "mm")
    return d.field && d.unit === "mm"
      ? {
          field: d.field,
          value: d.value! / 25.4,
          unit: "in",
          page,
          evidence: d.evidence,
          readable: true,
        }
      : undefined;
  return {
    field: d.field,
    value: d.value!,
    unit: d.unit,
    page,
    evidence: d.evidence,
    readable: true,
  };
}
