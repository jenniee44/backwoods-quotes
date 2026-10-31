import type { AnalysisSuggestion } from "./analysis";
import {
  primaryMaterialDescription,
  detailOnlyBeamEvidence,
} from "./primaryMaterial";
import { normalizeSpecification } from "./componentIdentity";

type Identity = Pick<
  AnalysisSuggestion,
  "description" | "specification" | "category" | "beamAssemblies"
> & { calculation?: { kind: string } };
export const structuralLumberSpecification = (spec = "") =>
  /^\s*(?:\d+\s*[- ]?(?:ply|plies)\s+)?\d+\s*[x×]\s*\d+(?:\s*(?:PT|P\.?T\.?|pressure[- ]treated|SPF|LVL|wood|lumber|beam|girder))*\s*$/i.test(
    spec,
  ) ||
  (/\b\d+\s*[- ]?(?:ply|plies)\b/i.test(spec) &&
    /\b\d+\s*[x×]\s*\d+\b/i.test(spec) &&
    !/hanger|LUS\d+|connector|fastener|screw|bolt/i.test(spec));
export function hardwareIdentity(item: Identity) {
  return (
    /hanger|LUS\d+|connector|fastener|screw|bolt|bracket|post (?:base|cap)/i.test(
      primaryMaterialDescription(item.description),
    ) ||
    (!/\bbeam|girder|joist|post|ledger\b/i.test(item.description) &&
      /Hangers|connectors|fasteners/i.test(item.category ?? ""))
  );
}
export function materialIdentityProblem(item: Identity) {
  return (hardwareIdentity(item) ||
    /hanger|LUS\d+|connector/i.test(item.description) ||
    /Hangers|connectors|fasteners/i.test(item.category ?? "") ||
    item.calculation?.kind === "hardware") &&
    (structuralLumberSpecification(item.specification) ||
      (/\b\d+\s*[- ]?ply\b/i.test(item.specification ?? "") &&
        /\d+\s*[x×]\s*\d+/i.test(item.specification ?? "")))
    ? "Material identity conflict: structural lumber is not a hanger or hardware specification. Confirm the component and its own quantity before approval."
    : "";
}
function hardwareSpecification(source: AnalysisSuggestion) {
  const facts = [
    source.description,
    source.specification ?? "",
    ...(source.sourceFacts ?? []),
  ].filter(
    (s) => !/unreadable|illegible|uncertain|possibly|maybe|assum|\?/i.test(s),
  );
  const models = [
    ...new Set(
      facts.flatMap((s) =>
        [
          ...s.matchAll(
            /\b(?:Simpson\s+)?LUS\d+[A-Z0-9-]*(?:\s+(?:joist\s*)?hangers?)?(?:\s+or equivalent)?/gi,
          ),
        ].map((m) => m[0]),
      ),
    ),
  ];
  return new Set(
    models.map((m) =>
      normalizeSpecification(m.match(/LUS\d+[A-Z0-9-]*/i)?.[0] ?? m),
    ),
  ).size === 1
    ? models.sort((a, b) => b.length - a.length)[0]
    : "";
}
/** Material identity normalization, not display aliases. The raw source must be
 * retained separately by the caller. No source component count transfers roles. */
export function separateMixedHardware(source: AnalysisSuggestion) {
  if (!materialIdentityProblem(source)) return null;
  const spec = hardwareSpecification(source);
  const hanger =
    /hanger|LUS\d+|connector|post (?:base|cap)/i.test(source.description) ||
    !!spec;
  const primary: AnalysisSuggestion = {
    ...structuredClone(source),
    description: hanger ? "Joist hangers" : source.description,
    category: hanger ? "Hangers / connectors" : "Structural fasteners",
    specification: spec,
    quantity: null,
    unit: "each",
    quantityMethod: "Unknown",
    classification: "Contractor input required",
    confidence: "Low",
    destination: "Materials",
    itemRole: "Construction item",
    assemblyReference: "",
    beamAssemblies: [],
    materialInputs: [],
    drawingDimensions: [],
    supportBasis: "Not established",
    subcontractorBasis: "Not established",
    sourceFacts: spec ? [spec] : [],
    assumptions: [],
    warnings: [
      "Confirm this hardware's model and connection/piece quantity. A mixed beam observation is not a hardware count.",
    ],
    notes:
      "Material identity corrected from a mixed source record. Original specifications, quantities and beam observations are retained in private source evidence. Contractor review required.",
    calculationBasis: "No hardware count established by the mixed record.",
  };
  const beam: AnalysisSuggestion = {
    ...structuredClone(source),
    description: "Built-up beam assembly",
    category: "Beams",
    destination: "Materials",
    itemRole: "Construction item",
    quantity: null,
    unit: "runs",
    quantityMethod: "Unknown",
    classification: "Contractor input required",
    confidence: "Low",
    // Preserve every physical observation, never invent extra lines from labels.
    beamAssemblies: structuredClone(source.beamAssemblies ?? []),
    materialInputs: (source.materialInputs ?? []).filter(
      (f) => f.field === "plies" && f.readable,
    ),
    drawingDimensions: [],
    calculationBasis:
      "Physical beam observations and ply specification only; full lengths, stock and cutting requirements remain separate.",
  };
  const explicitHardware =
    /hanger|LUS\d+|connector|fastener|screw|bolt|bracket/i.test(
      source.description,
    ) || !!spec;
  const hasBeam =
    /\bply\b|\d+PLY\b|\bbeam|girder/i.test(source.specification ?? "") ||
    !!beam.beamAssemblies?.length;
  return {
    primary:
      /\bbeam|girder\b/i.test(primaryMaterialDescription(source.description)) &&
      hasBeam
        ? {
            ...beam,
            ...(detailOnlyBeamEvidence(source)
              ? {
                  destination: "Informational" as const,
                  itemRole: "Supporting evidence" as const,
                }
              : {}),
          }
        : primary,
    related:
      explicitHardware && hasBeam
        ? /\bbeam|girder\b/i.test(
            primaryMaterialDescription(source.description),
          )
          ? primary
          : beam
        : undefined,
    original: structuredClone(source),
  };
}
