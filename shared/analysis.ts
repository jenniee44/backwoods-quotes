import { maxAnalysisBytes } from "./analysisPackage";
import {
  validPdfText,
  validatePdfRegion,
  maxDetailRegions,
  maxAnalysisTextChars,
} from "./pdf";
import type { PdfTextLayer, PdfDetailRegion } from "./pdf";
import { prepareConstructionAnalysis } from "./takeoff";
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
// Optional on saved V2 records; required (empty when unknown) in new provider output.
export type ConstructionEvidence = {
  sourceDetailView?: number | null;
  supportBasis?:
    | "Not established"
    | "Total visible locations"
    | "Apparent new work"
    | "Existing work"
    | "By others";
  scopeGroup?: string;
  specification?: string;
  location?: string;
  sourceFacts?: string[];
  calculationBasis?: string;
  quantityMethod?: "Written" | "Counted" | "Calculated" | "Unknown" | "Scaled";
  itemRole?:
    "Construction item" | "Document observation" | "Supporting evidence";
  subcontractorBasis?:
    "Explicit by others" | "Separate trade suggestion" | "Not established";
};
export type ContractorSummary = {
  majorScope: string[];
  readableSpecifications: string[];
  majorUnknowns: string[];
  siteVerification: string[];
  observations: string[];
};
export const constructionGroups = [
  "Site / Demolition",
  "Footings & Foundations",
  "Posts & Beams",
  "Framing",
  "Decking",
  "Stairs",
  "Railings / Guards",
  "Hardware & Connectors",
  "Finishing",
  "Labour",
  "Subcontracted / By Others",
  "Informational / Verification",
];
export type AnalysisSuggestion = ConstructionEvidence & {
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
  summary?: ContractorSummary;
  duplicatesReduced?: number;
  sourceObservations?: AnalysisSuggestion[];
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
export const materialCategories = [
  "Posts",
  "Beams",
  "Joists",
  "Ledger",
  "Blocking",
  "Footings / concrete",
  "Hangers / connectors",
  "Structural fasteners",
  "Decking",
  "Fascia / trim",
  "Guards / railings",
  "Stairs / stringers",
];
const evidenceProperties = {
  sourceDetailView: {
    type: ["integer", "null"],
    minimum: 1,
    maximum: maxDetailRegions,
  },
  supportBasis: {
    type: "string",
    enum: [
      "Not established",
      "Total visible locations",
      "Apparent new work",
      "Existing work",
      "By others",
    ],
  },
  scopeGroup: { type: "string", maxLength: 100 },
  specification: {
    type: "string",
    maxLength: 1000,
    description:
      "Exact readable construction notation, retaining ply count, nominal member size, material and spacing as written. Empty if unreadable; never complete a missing specification.",
  },
  location: { type: "string", maxLength: 200 },
  sourceFacts: {
    type: "array",
    items: { type: "string", maxLength: 1000 },
    maxItems: 20,
  },
  calculationBasis: {
    type: "string",
    maxLength: 2000,
    description:
      "For calculated quantities, reproducible equation with every supported input, units, source page, layout/edge assumptions and scope basis. Never derive quantities from pixel scale or repeated detail views.",
  },
  quantityMethod: {
    type: "string",
    enum: ["Written", "Counted", "Calculated", "Unknown", "Scaled"],
  },
  itemRole: {
    type: "string",
    enum: ["Construction item", "Document observation", "Supporting evidence"],
  },
  subcontractorBasis: {
    type: "string",
    enum: [
      "Explicit by others",
      "Separate trade suggestion",
      "Not established",
    ],
  },
};
export function validConstructionEvidence(v: Record<string, unknown>): boolean {
  return Object.entries(evidenceProperties).every(([key, schema]) => {
    const value = v[key];
    if (value === undefined) return true; // Existing saved quotes/older responses.
    if (key === "sourceDetailView")
      return (
        value === null ||
        (typeof value === "number" &&
          Number.isInteger(value) &&
          value >= 1 &&
          value <= maxDetailRegions)
      );
    if ("enum" in schema) return schema.enum.includes(value as never);
    if (key === "sourceFacts") return texts(value, 20);
    return "maxLength" in schema && text(value, schema.maxLength);
  });
}
const summaryKeys = [
  "majorScope",
  "readableSpecifications",
  "majorUnknowns",
  "siteVerification",
  "observations",
];
export function validContractorSummary(v: unknown): boolean {
  return (
    record(v) &&
    Object.keys(v).every((k) => summaryKeys.includes(k)) &&
    summaryKeys.every((k) => texts(v[k]))
  );
}
const itemProperties = {
  ...evidenceProperties,
  description: { type: "string", maxLength: 500 },
  quantity: {
    type: ["number", "null"],
    minimum: 0,
    description:
      "Supported written, uniquely counted or reproducibly calculated quantity only. Null if inputs, component identity, scope or source legibility are uncertain. Never model-estimated labour hours.",
  },
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
    summary: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        summaryKeys.map((key) => [
          key,
          {
            type: "array",
            items: { type: "string", maxLength: 1000 },
            maxItems: 40,
          },
        ]),
      ),
      required: summaryKeys,
    },
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
    sourceObservations: { type: "array", items: itemSchema, maxItems: 100 },
    dimensions: { type: "array", items: itemSchema, maxItems: 100 },
    suggestions: { type: "array", items: itemSchema, maxItems: 150 },
    assumptions: { type: "array", items: { type: "string" }, maxItems: 40 },
    warnings: { type: "array", items: { type: "string" }, maxItems: 40 },
  },
  required: [
    "project",
    "summary",
    "dimensions",
    "sourceObservations",
    "suggestions",
    "assumptions",
    "warnings",
  ],
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
  documents?: AnalysisDocument[],
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
          "summary",
          "duplicatesReduced",
          "dimensions",
          "sourceObservations",
          "suggestions",
          "assumptions",
          "warnings",
        ].includes(k),
    ) ||
    !record(value.project)
  )
    return fail();
  if (value.summary !== undefined && !validContractorSummary(value.summary))
    return fail();
  if (
    value.duplicatesReduced !== undefined &&
    (!Number.isInteger(value.duplicatesReduced) ||
      Number(value.duplicatesReduced) < 0 ||
      Number(value.duplicatesReduced) > 250)
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
    ["sourceObservations", 100],
    ["dimensions", 100],
    ["suggestions", 150],
  ] as const) {
    const items = value[key];
    if (key === "sourceObservations" && items === undefined) continue;
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
        !texts(item.warnings, 20) ||
        !validConstructionEvidence(item)
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
      if (item.sourceDetailView && documents) {
        const source = documents.find((d) => d.id === item.documentId);
        const region =
          source?.detailRegions?.[Number(item.sourceDetailView) - 1];
        if (!region || region.page !== item.page) return fail();
      }
      // Any missing measurement is explicitly uncertain, never silently zero.
      if (item.quantity === null && key !== "sourceObservations") {
        item.confidence = "Low";
        item.classification = "Contractor input required";
      }
    }
  }
  return prepareConstructionAnalysis(
    structuredClone(value) as PlanAnalysisResult,
  );
}
export type AnalysisDocument = {
  pdfText?: PdfTextLayer;
  detailRegions?: PdfDetailRegion[];
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
  let totalText = 0;
  let regionCount = 0;
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
    if (!bytes.length || bytes.length > 2_000_000 || total > maxAnalysisBytes)
      throw new Error(
        "Analyze up to 8 MB of plans at once. Select fewer or smaller files.",
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
    if (d.pdfText !== undefined) {
      if (d.type !== "application/pdf" || !validPdfText(d.pdfText))
        throw new Error(
          "The PDF text layer is invalid. Reattach the original drawing.",
        );
      totalText += d.pdfText.pages.reduce((sum, p) => sum + p.text.length, 0);
      if (totalText > maxAnalysisTextChars)
        throw new Error(
          "Too much extracted plan text for one request. Select fewer drawings.",
        );
    }
    if (d.detailRegions !== undefined) {
      if (d.type !== "application/pdf" || !Array.isArray(d.detailRegions))
        throw new Error("Detail views must belong to an original PDF.");
      for (const raw of d.detailRegions) {
        const region = validatePdfRegion(raw);
        if (d.pdfText && region.page > (d.pdfText as PdfTextLayer).pageCount)
          throw new Error("This PDF detail page is invalid.");
        regionCount++;
        total += atob(region.data.split(",")[1]).length;
        if (regionCount > maxDetailRegions)
          throw new Error("Include up to 24 PDF detail views per analysis.");
        if (total > maxAnalysisBytes)
          throw new Error(
            "Original files and detail views must fit within 8 MB. Remove a detail or select fewer files; originals are never reduced.",
          );
      }
    }
  }
  return value.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    data: d.data,
    ...(d.pdfText
      ? {
          pdfText: {
            pageCount: d.pdfText.pageCount,
            truncated: d.pdfText.truncated,
            pages: d.pdfText.pages.map((page: import("./pdf").PdfTextPage) => ({
              page: page.page,
              width: page.width,
              height: page.height,
              text: page.text,
              status: page.status,
            })),
          },
        }
      : {}),
    ...(d.detailRegions
      ? { detailRegions: d.detailRegions.map(validatePdfRegion) }
      : {}),
  }));
}
