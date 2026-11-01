import { explicitBeamIdentity } from "./componentSubject";
import { materialIdentityProblem } from "./materialIdentity";
import { sameSpatialBeam, mergeSpatialBeams } from "./spatialBeams";
import type {
  AnalysisDocument,
  AnalysisSuggestion,
  PlanAnalysisResult,
} from "./analysis";
import {
  beamViews,
  spatialBeamSchema,
  validSpatialBeams,
  type SpatialBeam,
} from "./spatialBeams";
export type BeamLayoutEntry = SpatialBeam & {
  documentId: string;
  location: string;
  sourceDetailView: number | null;
};
/** Geometry is inventoried before material quantities/scope. No extra provider
 * call, pixel measurement, default line count, stock or splice inference. */
export const beamLayoutInventorySchema = {
  type: "array",
  maxItems: 50,
  description:
    "Inventory every independently visible complete physical beam centerline from framing plans before material takeoff. Preserve its labels, support anchors and dimension associations even when full length or scope is unknown. Repeated labels are not runs; a detail sketch is a reference view, not a plan run. Never split a complete beam into support spans.",
  items: {
    ...spatialBeamSchema.items,
    properties: {
      ...spatialBeamSchema.items.properties,
      documentId: { type: "string", maxLength: 100 },
      location: { type: "string", maxLength: 500 },
      sourceDetailView: { type: ["integer", "null"], minimum: 1, maximum: 24 },
    },
    required: [
      ...spatialBeamSchema.items.required,
      "documentId",
      "location",
      "sourceDetailView",
    ],
  },
};
export function validBeamLayoutInventory(
  value: unknown,
  ids: string[],
  documents?: AnalysisDocument[],
): value is BeamLayoutEntry[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry))
        return false;
      const { documentId, location, sourceDetailView, ...beam } = entry;
      if (
        !ids.includes(documentId) ||
        typeof location !== "string" ||
        !location.trim() ||
        location.length > 500 ||
        !beamViews.includes(beam.view) ||
        !validSpatialBeams([beam])
      )
        return false;
      if (
        sourceDetailView !== null &&
        (!Number.isInteger(sourceDetailView) ||
          sourceDetailView < 1 ||
          sourceDetailView > 24)
      )
        return false;
      const doc = documents?.find((d) => d.id === documentId);
      if (doc?.pdfText && beam.page > doc.pdfText.pageCount) return false;
      if (
        documents &&
        sourceDetailView !== null &&
        doc?.detailRegions?.[sourceDetailView - 1]?.page !== beam.page
      )
        return false;
      return true;
    })
  );
}
/** Expand into the existing saved evidence format, so old estimates/exports need
 * no migration. Keep every source observation; geometric consolidation downstream
 * reconciles repeated views without adding counts. */
export function materializeBeamLayoutInventory(result: PlanAnalysisResult) {
  const inventory = result.beamLayoutInventory;
  delete result.beamLayoutInventory;
  if (!inventory?.length) return;
  const groups = new Map<string, AnalysisSuggestion>();
  const evidence: AnalysisSuggestion[] = [];
  for (const { documentId, location, sourceDetailView, ...beam } of inventory) {
    const plan = beam.view === "Framing plan";
    const key = JSON.stringify([
      documentId,
      beam.page,
      beam.sheet,
      location,
      beam.specification,
      beam.scope,
      beam.view,
    ]);
    const observation: AnalysisSuggestion = {
      documentId,
      page: beam.page,
      sourceDetailView,
      location,
      description: plan
        ? "Beam layout — framing plan"
        : `Beam reference — ${beam.view}`,
      specification: beam.specification,
      category: "Beams",
      quantity: null,
      unit: "runs",
      quantityMethod: "Unknown",
      confidence: beam.confidence,
      destination: plan ? "Materials" : "Informational",
      classification: "Plan fact",
      itemRole: plan ? "Construction item" : "Supporting evidence",
      notes:
        "Physical linework evidence only. Support intervals, plies and purchasing boards are separate; no stock lengths or splice arrangements inferred.",
      assumptions: [],
      warnings: [],
      supportBasis: "Not established",
      beamAssemblies: [structuredClone(beam)],
      sourceFacts: [beam.evidence],
    };
    evidence.push({
      ...structuredClone(observation),
      itemRole: "Document observation",
      destination: "Informational",
    });
    const group = groups.get(key);
    if (group && group.beamAssemblies!.length < 20) {
      group.beamAssemblies!.push(structuredClone(beam));
      group.sourceFacts = [...new Set([...group.sourceFacts!, beam.evidence])];
      // Each observation still retains its own original detail provenance below.
      if (group.sourceDetailView !== sourceDetailView)
        group.sourceDetailView = null;
    } else {
      // A chunk is a bounded review container, never an extra physical assembly.
      const chunk = group ? `${key}:${evidence.length}` : key;
      groups.set(chunk, observation);
    }
  }
  const additions: AnalysisSuggestion[] = [];
  for (const group of groups.values()) {
    // Geometry, not wording/location aliases, proves that an existing candidate
    // describes part of this same layout. Preserve its original inputs/count as
    // evidence; never copy a single member's measurements onto all grouped runs.
    const index =
      group.destination === "Materials"
        ? result.suggestions.findIndex(
            (item) =>
              explicitBeamIdentity(item) &&
              !materialIdentityProblem(item) &&
              item.documentId === group.documentId &&
              item.page === group.page &&
              !!item.beamAssemblies?.length &&
              item.beamAssemblies.every((b) =>
                group.beamAssemblies!.some((other) =>
                  sameSpatialBeam(b, other),
                ),
              ),
          )
        : -1;
    if (index < 0) {
      additions.push(group);
      continue;
    }
    const original = result.suggestions[index];
    const merged = mergeSpatialBeams(
      original.beamAssemblies,
      group.beamAssemblies,
    );
    if (merged.length > 20) {
      additions.push(group);
      continue;
    }
    evidence.push({
      ...structuredClone(original),
      itemRole: "Document observation",
      destination: "Informational",
    });
    result.suggestions[index] = { ...group, beamAssemblies: merged };
  }
  if (
    result.suggestions.length + additions.length > 150 ||
    (result.sourceObservations?.length ?? 0) + evidence.length > 100
  )
    throw new Error(
      "Beam layout evidence exceeds the safe review limits; no partial takeoff was added.",
    );
  result.suggestions.push(...additions);
  result.sourceObservations = [
    ...(result.sourceObservations ?? []),
    ...evidence,
  ];
}
