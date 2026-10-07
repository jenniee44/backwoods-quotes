export const destinations = [
  "Labour",
  "Materials",
  "Subcontractor",
  "Other Costs",
  "Informational",
] as const;
export const classifications = [
  "Plan fact",
  "Calculated quantity",
  "Estimating suggestion",
  "Contractor input required",
] as const;
export type AnalysisSuggestion = {
  description: string;
  quantity: number | null;
  unit: string;
  documentId: string;
  page: number | null;
  notes: string;
  confidence: "Unspecified" | "Low" | "Medium" | "High";
  category?: string;
  destination?: (typeof destinations)[number];
  classification?: (typeof classifications)[number];
  assumptions?: string[];
  warnings?: string[];
};
export type PlanAnalysisResult = {
  suggestions: AnalysisSuggestion[];
  warnings: string[];
  project?: {
    projectType: string;
    drawingTitle: string;
    drawingNumbers: string[];
    revision: string;
    date: string;
    description: string;
  };
  dimensions?: AnalysisSuggestion[];
  assumptions?: string[];
};
const itemProperties = {
  description: { type: "string", maxLength: 500 },
  quantity: { type: ["number", "null"], minimum: 0 },
  unit: { type: "string", maxLength: 60 },
  documentId: { type: "string", maxLength: 100 },
  page: { type: ["integer", "null"], minimum: 1 },
  notes: { type: "string", maxLength: 2000 },
  confidence: { type: "string", enum: ["Low", "Medium", "High"] },
  category: { type: "string", maxLength: 100 },
  destination: { type: "string", enum: destinations },
  classification: { type: "string", enum: classifications },
  assumptions: {
    type: "array",
    items: { type: "string", maxLength: 1000 },
    maxItems: 20,
  },
  warnings: {
    type: "array",
    items: { type: "string", maxLength: 1000 },
    maxItems: 20,
  },
};
const itemSchema = {
  type: "object",
  additionalProperties: false,
  properties: itemProperties,
  required: Object.keys(itemProperties),
};
export const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    project: {
      type: "object",
      additionalProperties: false,
      properties: {
        projectType: { type: "string" },
        drawingTitle: { type: "string" },
        drawingNumbers: { type: "array", items: { type: "string" } },
        revision: { type: "string" },
        date: { type: "string" },
        description: { type: "string" },
      },
      required: [
        "projectType",
        "drawingTitle",
        "drawingNumbers",
        "revision",
        "date",
        "description",
      ],
    },
    dimensions: { type: "array", items: itemSchema, maxItems: 100 },
    suggestions: { type: "array", items: itemSchema, maxItems: 150 },
    assumptions: { type: "array", items: { type: "string" }, maxItems: 40 },
    warnings: { type: "array", items: { type: "string" }, maxItems: 40 },
  },
  required: ["project", "dimensions", "suggestions", "assumptions", "warnings"],
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 2000) =>
  typeof v === "string" && v.length <= max;
const texts = (v: unknown, max = 40) =>
  Array.isArray(v) && v.length <= max && v.every((x) => text(x, 1000));
export function validateAnalysis(
  value: unknown,
  documentIds: string[],
): PlanAnalysisResult {
  value = structuredClone(value);
  const fail = () => {
    throw new Error(
      "The analysis response could not be validated. Try again or enter a manual takeoff.",
    );
  };
  if (
    !record(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          "project",
          "dimensions",
          "suggestions",
          "assumptions",
          "warnings",
        ].includes(k),
    ) ||
    !record(value.project)
  )
    return fail();
  const p = value.project;
  if (
    Object.keys(p).some(
      (k) =>
        ![
          "projectType",
          "drawingTitle",
          "drawingNumbers",
          "revision",
          "date",
          "description",
        ].includes(k),
    ) ||
    !["projectType", "drawingTitle", "revision", "date", "description"].every(
      (k) => text(p[k]),
    ) ||
    !texts(p.drawingNumbers) ||
    !texts(value.assumptions) ||
    !texts(value.warnings)
  )
    return fail();
  for (const [key, max] of [
    ["dimensions", 100],
    ["suggestions", 150],
  ] as const) {
    const items = value[key];
    if (!Array.isArray(items) || items.length > max) return fail();
    for (const item of items) {
      if (
        !record(item) ||
        Object.keys(item).some((k) => !(k in itemProperties)) ||
        !text(item.description, 500) ||
        !String(item.description).trim() ||
        !text(item.unit, 60) ||
        !text(item.documentId, 100) ||
        !documentIds.includes(String(item.documentId)) ||
        !text(item.notes) ||
        !text(item.category, 100) ||
        !texts(item.assumptions, 20) ||
        !texts(item.warnings, 20)
      )
        return fail();
      if (
        item.quantity !== null &&
        (typeof item.quantity !== "number" ||
          !Number.isFinite(item.quantity) ||
          item.quantity < 0)
      )
        return fail();
      if (
        item.page !== null &&
        (typeof item.page !== "number" ||
          !Number.isInteger(item.page) ||
          item.page < 1 ||
          item.page > 50)
      )
        return fail();
      if (
        !["Low", "Medium", "High"].includes(String(item.confidence)) ||
        !destinations.includes(
          item.destination as (typeof destinations)[number],
        ) ||
        !classifications.includes(
          item.classification as (typeof classifications)[number],
        )
      )
        return fail();
      // Any missing measurement is explicitly uncertain, never silently zero.
      if (item.quantity === null) {
        item.confidence = "Low";
        item.classification = "Contractor input required";
      }
    }
  }
  return structuredClone(value) as PlanAnalysisResult;
}
export type AnalysisDocument = {
  id: string;
  name: string;
  type: string;
  data: string;
};
export function validateDocuments(value: unknown): AnalysisDocument[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    throw new Error("Attach between one and eight plans.");
  const ids = new Set<string>();
  let total = 0;
  for (const d of value) {
    if (
      !record(d) ||
      !text(d.id, 100) ||
      !String(d.id).trim() ||
      ids.has(String(d.id)) ||
      !text(d.name, 200) ||
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
        String(d.type),
      ) ||
      typeof d.data !== "string"
    )
      throw new Error(
        "Use PDF, JPG, JPEG, PNG or WebP plan files with unique sources.",
      );
    ids.add(String(d.id));
    const prefix = `data:${d.type};base64,`;
    if (!d.data.startsWith(prefix) || d.data.length > 2_700_000)
      throw new Error("Each plan must be no larger than 2 MB.");
    let bytes: string;
    try {
      bytes = atob(d.data.slice(prefix.length));
    } catch {
      throw new Error("A plan file could not be read. Please attach it again.");
    }
    total += bytes.length;
    if (!bytes.length || bytes.length > 2_000_000 || total > 4_000_000)
      throw new Error(
        "Analyze up to 4 MB of plans at once. Select fewer or smaller files.",
      );
    const signature =
      d.type === "application/pdf"
        ? bytes.startsWith("%PDF-") && bytes.slice(-2048).includes("%%EOF")
        : d.type === "image/png"
          ? bytes.startsWith("\x89PNG\r\n\x1a\n")
          : d.type === "image/jpeg"
            ? bytes.startsWith("\xff\xd8\xff")
            : bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WEBP";
    if (!signature)
      throw new Error(
        "A plan is corrupted or its contents do not match its file type.",
      );
  }
  return value.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    data: d.data,
  }));
}
