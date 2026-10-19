import { normalizeSpecification } from "./componentIdentity";
// Drawing coordinates identify evidence, never construction lengths or drawing scale.
export type DrawingPoint = { x: number; y: number };
export type BeamDimension = {
  written: string;
  role:
    "Overall" | "Full beam length" | "Span" | "Support spacing" | "Uncertain";
  association: "Explicit endpoints" | "Uncertain";
  start: DrawingPoint;
  end: DrawingPoint;
  evidence: string;
};
export type SpatialBeam = {
  page: number;
  sheet: string;
  drawingLabel: string;
  start: DrawingPoint;
  end: DrawingPoint;
  specification: string;
  labels: { text: string; point: DrawingPoint }[];
  supports: { point: DrawingPoint; evidence: string }[];
  dimensions: BeamDimension[];
  scope:
    | "New work"
    | "Existing work to remain"
    | "By others / excluded"
    | "Requires scope confirmation";
  confidence: "Low" | "Medium" | "High";
  evidence: string;
};
const point = {
  type: "object",
  additionalProperties: false,
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["x", "y"],
};
const text = { type: "string", maxLength: 500 };
const roles = [
  "Overall",
  "Full beam length",
  "Span",
  "Support spacing",
  "Uncertain",
];
const scopes = [
  "New work",
  "Existing work to remain",
  "By others / excluded",
  "Requires scope confirmation",
];
export const spatialBeamSchema = {
  type: "array",
  maxItems: 20,
  description:
    "Proposed physical beam centerlines in ORIGINAL page viewport normalized 0..1 top-left coordinates, not detail-image coordinates. One entry per physical assembly, never per repeated label. Empty if geometry is unclear. Coordinates are for association only; never scale measurements.",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      page: { type: "integer", minimum: 1, maximum: 50 },
      sheet: { type: "string", maxLength: 80 },
      drawingLabel: { type: "string", maxLength: 80 },
      start: point,
      end: point,
      specification: text,
      labels: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: { text, point },
          required: ["text", "point"],
        },
      },
      supports: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: { point, evidence: text },
          required: ["point", "evidence"],
        },
      },
      dimensions: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            written: { type: "string", maxLength: 100 },
            role: { type: "string", enum: roles },
            association: {
              type: "string",
              enum: ["Explicit endpoints", "Uncertain"],
            },
            start: point,
            end: point,
            evidence: text,
          },
          required: [
            "written",
            "role",
            "association",
            "start",
            "end",
            "evidence",
          ],
        },
      },
      scope: { type: "string", enum: scopes },
      confidence: { type: "string", enum: ["Low", "Medium", "High"] },
      evidence: text,
    },
    required: [
      "page",
      "sheet",
      "drawingLabel",
      "start",
      "end",
      "specification",
      "labels",
      "supports",
      "dimensions",
      "scope",
      "confidence",
      "evidence",
    ],
  },
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const str = (v: unknown, n = 500) => typeof v === "string" && v.length <= n;
const validPoint = (v: unknown): v is DrawingPoint =>
  record(v) &&
  keys(v, ["x", "y"]) &&
  [v.x, v.y].every(
    (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
  );
const list = (v: unknown, max: number, valid: (x: unknown) => boolean) =>
  Array.isArray(v) && v.length <= max && v.every(valid);
export function validSpatialBeams(v: unknown): v is SpatialBeam[] {
  return list(
    v,
    20,
    (b) =>
      record(b) &&
      keys(b, [
        "page",
        "sheet",
        "drawingLabel",
        "start",
        "end",
        "specification",
        "labels",
        "supports",
        "dimensions",
        "scope",
        "confidence",
        "evidence",
      ]) &&
      Number.isInteger(b.page) &&
      Number(b.page) >= 1 &&
      Number(b.page) <= 50 &&
      str(b.sheet, 80) &&
      str(b.drawingLabel, 80) &&
      str(b.specification) &&
      str(b.evidence) &&
      validPoint(b.start) &&
      validPoint(b.end) &&
      scopes.includes(String(b.scope)) &&
      ["Low", "Medium", "High"].includes(String(b.confidence)) &&
      list(
        b.labels,
        12,
        (l) =>
          record(l) &&
          keys(l, ["text", "point"]) &&
          str(l.text) &&
          validPoint(l.point),
      ) &&
      list(
        b.supports,
        12,
        (s) =>
          record(s) &&
          keys(s, ["point", "evidence"]) &&
          validPoint(s.point) &&
          str(s.evidence),
      ) &&
      list(
        b.dimensions,
        8,
        (d) =>
          record(d) &&
          keys(d, [
            "written",
            "role",
            "association",
            "start",
            "end",
            "evidence",
          ]) &&
          str(d.written, 100) &&
          str(d.evidence) &&
          roles.includes(String(d.role)) &&
          ["Explicit endpoints", "Uncertain"].includes(String(d.association)) &&
          validPoint(d.start) &&
          validPoint(d.end),
      ),
  );
}
const distance = (a: DrawingPoint, b: DrawingPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export function pointToBeam(p: DrawingPoint, b: SpatialBeam) {
  const dx = b.end.x - b.start.x,
    dy = b.end.y - b.start.y,
    den = dx * dx + dy * dy;
  const t = den
    ? Math.max(
        0,
        Math.min(1, ((p.x - b.start.x) * dx + (p.y - b.start.y) * dy) / den),
      )
    : 0;
  return distance(p, { x: b.start.x + t * dx, y: b.start.y + t * dy });
}
export function sameSpatialBeam(a: SpatialBeam, b: SpatialBeam) {
  const spec = (v: string) =>
    normalizeSpecification(v).replace(/[^a-z0-9]/g, "");
  if (a.scope !== b.scope || spec(a.specification) !== spec(b.specification))
    return false;
  if (a.drawingLabel && b.drawingLabel && a.drawingLabel !== b.drawingLabel)
    return false;
  if (a.page !== b.page) {
    return (
      !!a.drawingLabel &&
      a.drawingLabel === b.drawingLabel &&
      [a, b].every((ob) =>
        /repeated view of (?:the )?(?:same )?(?:physical )?beam|same physical beam/i.test(
          ob.evidence,
        ),
      )
    );
  }
  const tolerance = a.drawingLabel && b.drawingLabel ? 0.001 : 0.000001;
  return (
    a.sheet === b.sheet &&
    ((distance(a.start, b.start) <= tolerance &&
      distance(a.end, b.end) <= tolerance) ||
      (distance(a.start, b.end) <= tolerance &&
        distance(a.end, b.start) <= tolerance))
  );
}
export function uniqueSpatialBeams(beams: SpatialBeam[]) {
  const groups: SpatialBeam[][] = [];
  for (const beam of beams) {
    const g = groups.find((g) => sameSpatialBeam(g[0], beam));
    if (g) g.push(beam);
    else groups.push([beam]);
  }
  return groups;
}
export function beamGeometryProblem(b: SpatialBeam) {
  if (distance(b.start, b.end) < 0.02)
    return "Confirm the physical beam line; geometry is ambiguous.";
  if (b.confidence === "Low" || !b.evidence.trim())
    return "Confirm this proposed beam line against the drawing.";
  if (
    !b.specification.trim() ||
    /unknown|unreadable|to confirm|unspecified/i.test(b.specification) ||
    !b.labels.length ||
    b.labels.every((l) => pointToBeam(l.point, b) > 0.04)
  )
    return "Confirm which specification label belongs to this beam line.";
  if (b.supports.some((s) => pointToBeam(s.point, b) > 0.025))
    return "Confirm which support positions belong to this beam line.";
  const spec = normalizeSpecification(b.specification).replace(
    /[^a-z0-9]/g,
    "",
  );
  const labels = normalizeSpecification(
    b.labels
      .filter((l) => pointToBeam(l.point, b) <= 0.04)
      .map((l) => l.text)
      .join(" "),
  ).replace(/[^a-z0-9]/g, "");
  if (!labels.includes(spec))
    return "Confirm the readable specification associated with this beam line.";
  return "";
}
/** Explicit dimension endpoints must project to the full extent, never a partial span. */
export function fullBeamDimension(b: SpatialBeam, d: BeamDimension) {
  if (
    /overall|\bspan\b|support spacing|uncertain|assum|not confirmed/i.test(
      d.evidence,
    )
  )
    return false;
  if (
    d.role !== "Full beam length" ||
    d.association !== "Explicit endpoints" ||
    !d.evidence.trim() ||
    beamGeometryProblem(b)
  )
    return false;
  const dx = b.end.x - b.start.x,
    dy = b.end.y - b.start.y,
    den = dx * dx + dy * dy;
  const project = (p: DrawingPoint) =>
    ((p.x - b.start.x) * dx + (p.y - b.start.y) * dy) / den;
  const a = project(d.start),
    z = project(d.end);
  const aligned =
    Math.abs((d.end.x - d.start.x) * dy - (d.end.y - d.start.y) * dx) / den <
    0.02;
  return (
    aligned &&
    ((Math.abs(a) < 0.02 && Math.abs(z - 1) < 0.02) ||
      (Math.abs(z) < 0.02 && Math.abs(a - 1) < 0.02))
  );
}
// Identity blocks legacy description-only consolidation across separate lines or
// conflicting dimension observations. Evidence itself is retained, not discarded.
export function spatialBeamIdentity(beams: SpatialBeam[] | undefined) {
  return JSON.stringify(
    (beams ?? [])
      .map((b) => [
        b.page,
        b.start,
        b.end,
        b.specification,
        b.scope,
        b.drawingLabel,
        b.dimensions.map((d) => [
          d.role,
          d.written,
          d.association,
          d.start,
          d.end,
        ]),
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}
export function mergeSpatialBeams(
  a: SpatialBeam[] | undefined,
  b: SpatialBeam[] | undefined,
) {
  return [
    ...new Map(
      [...(a ?? []), ...(b ?? [])].map((v) => [JSON.stringify(v), v]),
    ).values(),
  ];
}

/** Partial overlapping collinear observations cannot safely establish two runs. */
export function spatialBeamOverlap(beams: SpatialBeam[]) {
  const groups = uniqueSpatialBeams(
    beams.filter((b) => b.scope === "New work"),
  );
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i][0],
        b = groups[j][0];
      if (a.page !== b.page) continue;
      const dx = a.end.x - a.start.x,
        dy = a.end.y - a.start.y,
        den = dx * dx + dy * dy;
      if (!den) continue;
      const project = (p: DrawingPoint) =>
        ((p.x - a.start.x) * dx + (p.y - a.start.y) * dy) / den;
      const off = (p: DrawingPoint) =>
        Math.abs((p.x - a.start.x) * dy - (p.y - a.start.y) * dx) /
        Math.sqrt(den);
      if (off(b.start) > 0.000001 || off(b.end) > 0.000001) continue;
      const lo = Math.min(project(b.start), project(b.end)),
        hi = Math.max(project(b.start), project(b.end));
      if (Math.min(1, hi) - Math.max(0, lo) > 0.01)
        return "Confirm whether overlapping beam segments are the same physical assembly or separate runs; counts are not added.";
    }
  return "";
}
