import type { Quote } from "./model";
import { materialTakeoffProposal } from "./deckTakeoff";
import { purchasingGroups } from "./purchasingGroups";

/** Explicit internal export: never used by customer documents or quote sharing. */
export function takeoffAnalysisExport(q: Quote) {
  return {
    format: "backwoods-private-takeoff-diagnostics",
    version: 1,
    exportedAt: new Date().toISOString(),
    privacy:
      "Internal analysis only. Contains drawing evidence; do not send to customers or publish. Original documents and images are not included.",
    reports: (q.analysisReports ?? []).map((r) => ({
      id: r.id,
      beamSupportRecoveryVersion: r.beamSupportRecoveryVersion,
      createdAt: r.createdAt,
      assumptions: r.assumptions,
      warnings: r.warnings,
      dimensions: r.dimensions?.map(observation),
      sourceObservations: r.sourceObservations?.map(observation),
      duplicateEvidence: r.duplicateEvidence?.map(observation),
      submittedDetailCount: r.aiDetails?.submittedCount,
    })),
    materials: q.takeoff.map((t) => ({
      id: t.id,
      analysisId: t.analysisId,
      ...observation(t),
      status: t.status,
      included: t.included,
      workScope: t.workScope,
      calculation: t.calculation,
      proposal: materialTakeoffProposal(t),
      reviewAcknowledged: t.reviewAcknowledged,
      scopeVerified: t.scopeVerified,
      purchaseVerified: t.purchaseVerified,
      conflictsVerified: t.conflictsVerified,
      convertedLineId: t.convertedLineId,
    })),
    groups: purchasingGroups(q, q.takeoff).map((g) => ({
      name: g.name,
      sourceIds: g.items.map((t) => t.id),
      quantity: g.quantity,
      unit: g.unit,
      basis: g.basis,
      unresolved: g.reason,
      observations: g.observations,
    })),
  };
}
function observation(t: import("../shared/analysis").AnalysisSuggestion) {
  return {
    documentId: t.documentId,
    page: t.page,
    sourceDetailView: t.sourceDetailView,
    description: t.description,
    specification: t.specification,
    location: t.location,
    quantity: t.quantity,
    unit: t.unit,
    quantityMethod: t.quantityMethod,
    classification: t.classification,
    itemRole: t.itemRole,
    confidence: t.confidence,
    sourceFacts: t.sourceFacts,
    materialInputs: t.materialInputs,
    beamAssemblies: t.beamAssemblies,
    calculationBasis: t.calculationBasis,
    assumptions: t.assumptions,
    warnings: t.warnings,
    notes: t.notes,
    supportBasis: t.supportBasis,
  };
}
export function downloadTakeoffAnalysis(q: Quote) {
  const blob = new Blob([JSON.stringify(takeoffAnalysisExport(q), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "backwoods-private-takeoff-analysis.json";
  document.body.append(link);
  link.click();
  link.remove();
  // Safari needs the object URL to remain available while starting the download.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
