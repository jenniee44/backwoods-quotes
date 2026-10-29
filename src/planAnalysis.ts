import { AnalysisFailure, isAnalysisErrorCode } from "../shared/analysisErrors";
import { abortableAnalysis } from "../shared/abortableAnalysis";
import { consolidateBeamReviews } from "./consolidateBeamReviews";
import { spatialBeamIdentity } from "../shared/spatialBeams";
import { proposedBeamRecipe } from "./beamPrefill";
import { preservedDrawingInputs, proposedMaterialRecipe } from "./deckTakeoff";
import { materialInputIdentity } from "../shared/materialInputs";
import { completenessProblem } from "./takeoffRequirements";
import {
  equivalentComponentKey,
  evidenceScope,
  purchaseQuantityProblem,
} from "../shared/componentIdentity";
import { includedScope, assertScope } from "./takeoffScope";
import { calculateMaterial } from "../shared/materialCalculators";
import { maxAnalysisBodyBytes } from "../shared/analysisPackage";
import {
  prepareConstructionAnalysis,
  semanticItemKey,
  requiresScopeVerification,
} from "../shared/takeoff";
import { id, categories, normalizeCategory } from "./model";
import type { Quote, TakeoffItem } from "./model";
import {
  materialCategories,
  validateAnalysis,
  validateDocuments,
} from "../shared/analysis";
import type {
  PlanAnalysisResult,
  AnalysisSuggestion,
} from "../shared/analysis";
export type { PlanAnalysisResult, AnalysisSuggestion };
export interface PlanAnalysisService {
  analyze(
    documents: import("../shared/analysis").AnalysisDocument[],
    signal?: AbortSignal,
  ): Promise<PlanAnalysisResult>;
}
export const planAnalysisService: PlanAnalysisService = {
  async analyze(documents, signal) {
    const payload = validateDocuments(documents);
    const requestBody = JSON.stringify({ documents: payload });
    if (new TextEncoder().encode(requestBody).length > maxAnalysisBodyBytes)
      throw new Error(
        "The original plans, text and detail views exceed the request limit. Select fewer files/details; originals will not be reduced.",
      );
    try {
      return await abortableAnalysis(
        async (requestSignal) => {
          let response: Response;
          try {
            response = await fetch("/api/plan-analysis", {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: requestBody,
              signal: requestSignal,
            });
          } catch (error) {
            if (requestSignal.aborted) throw requestSignal.reason ?? error;
            throw new Error(
              "The analysis service could not be reached. Check your connection or sign in through Cloudflare Access.",
            );
          }
          if (
            !response.headers.get("Content-Type")?.includes("application/json")
          )
            throw new Error(
              "The analysis service is unavailable or requires sign-in. Configure Cloudflare Access and the API route.",
            );
          let body;
          try {
            body = await response.json();
          } catch {
            throw new Error(
              "The analysis service returned an unreadable response. Please retry or use manual takeoff.",
            );
          }
          if (!response.ok && isAnalysisErrorCode(body?.code)) {
            const retry =
              typeof body.retryAfterSeconds === "number" &&
              Number.isFinite(body.retryAfterSeconds)
                ? Math.max(1, Math.min(120, Math.ceil(body.retryAfterSeconds)))
                : undefined;
            const failure = new AnalysisFailure(body.code, retry);
            // Server recovery text is fixed and sanitized; do not forward arbitrary payload fields.
            if (
              typeof body.error === "string" &&
              body.error.endsWith(
                " Request tracking could not be cleared; duplicate protection may remain for up to two minutes. Wait before retrying.",
              )
            )
              failure.message +=
                " Request tracking could not be cleared; duplicate protection may remain for up to two minutes. Wait before retrying.";
            throw failure;
          }
          if (!response.ok)
            throw new Error(
              typeof body?.error === "string"
                ? body.error
                : "Plan analysis failed. Try again or use manual takeoff.",
            );
          return validateAnalysis(
            body,
            documents.map((d) => d.id),
            payload,
          );
        },
        signal,
        120000,
      );
    } catch (e) {
      if ((e as Error)?.name === "TimeoutError" && !signal?.aborted)
        throw new AnalysisFailure("ANALYSIS_CLIENT_TIMEOUT");
      throw e;
    }
  },
};
export async function documentFingerprint(
  documents: import("../shared/analysis").AnalysisDocument[],
): Promise<string> {
  // SubtleCrypto is unavailable on unsecured LAN HTTP previews; don't weaken hashes.
  if (!crypto.subtle)
    throw new Error(
      "Analyze plans requires HTTPS or a local localhost connection.",
    );
  const bytes = new TextEncoder().encode(
    JSON.stringify(
      documents.map((d) => ({
        id: d.id,
        type: d.type,
        data: d.data,
        ...(d.detailRegions?.length ? { detailRegions: d.detailRegions } : {}),
      })),
    ),
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function addAnalysisSuggestions(
  q: Quote,
  result: PlanAnalysisResult,
  fingerprint?: string,
  analyzedDocuments = q.documents,
  analysisId = id(),
): Quote {
  if (q.status !== "Draft")
    throw new Error("Only draft quotes accept plan suggestions.");
  if (
    fingerprint &&
    q.analysisReports?.some((report) => report.fingerprint === fingerprint)
  )
    throw new Error(
      "These plans have already been analyzed in this quote. Review the existing results.",
    );
  const drawingSuggestions = result.suggestions;
  result = prepareConstructionAnalysis(result);
  const suggestions = result.suggestions.map((item) => {
    if (
      !item.description.trim() ||
      (item.quantity !== null && !item.unit.trim()) ||
      (item.quantity !== null &&
        (!Number.isFinite(item.quantity) || item.quantity < 0)) ||
      !q.documents.some((d) => d.id === item.documentId) ||
      (item.page !== null && (!Number.isInteger(item.page) || item.page < 1)) ||
      !["Unspecified", "Low", "Medium", "High"].includes(item.confidence)
    )
      throw new Error("Plan suggestion has an invalid measurement or source.");
    return {
      assemblyReference: item.assemblyReference,
      drawingDimensions: structuredClone(item.drawingDimensions ?? []),
      sourceDetailView: item.sourceDetailView,
      supportBasis: item.supportBasis,
      scopeVerified: false,
      workScope: evidenceScope(item),
      included: evidenceScope(item) === "New work",
      scopeGroup: item.scopeGroup,
      specification: item.specification,
      location: item.location,
      sourceFacts: structuredClone(item.sourceFacts ?? []),
      ...(item.materialInputs
        ? { materialInputs: structuredClone(item.materialInputs) }
        : {}),
      ...(item.beamAssemblies
        ? { beamAssemblies: structuredClone(item.beamAssemblies) }
        : {}),
      calculationBasis: item.calculationBasis,
      quantityMethod: item.quantityMethod,
      itemRole: item.itemRole,
      subcontractorBasis: item.subcontractorBasis,
      id: id(),
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      documentId: item.documentId,
      page: item.page,
      notes: item.notes,
      confidence: item.quantity === null ? ("Low" as const) : item.confidence,
      status: "Proposed" as const,
      origin: "ai" as const,
      analysisId,
      analysisSourceKey: JSON.stringify([
        item.documentId,
        item.page,
        item.description,
        item.unit,
        item.quantity,
        item.classification,
      ]),
      category:
        item.destination === "Materials" &&
        materialCategories.includes(item.category ?? "")
          ? item.category
          : categories.includes(
                normalizeCategory(
                  item.category ?? "Miscellaneous",
                  item.description,
                ),
              )
            ? normalizeCategory(
                item.category ?? "Miscellaneous",
                item.description,
              )
            : "Miscellaneous",
      destination:
        evidenceScope(item) === "By others / excluded"
          ? ("Informational" as const)
          : (item.destination ?? "Informational"),
      classification:
        item.quantity === null
          ? ("Contractor input required" as const)
          : (item.classification ?? "Estimating suggestion"),
      assumptions: item.assumptions ?? [],
      warnings: item.warnings ?? [],
      reviewAcknowledged: false,
      sourceDocumentName: q.documents.find((d) => d.id === item.documentId)!
        .name,
    };
  });
  const candidateKey = (
    item: import("../shared/analysis").AnalysisSuggestion,
  ) =>
    JSON.stringify([
      equivalentComponentKey(item, item.category) || semanticItemKey(item),
      materialInputIdentity(item.materialInputs),
      ...(item.beamAssemblies?.length
        ? [spatialBeamIdentity(item.beamAssemblies)]
        : []),
    ]);
  const semanticSeen = new Set(
    q.takeoff.filter((item) => item.origin === "ai").map(candidateKey),
  );
  const duplicateEvidence: AnalysisSuggestion[] = [];
  let duplicatesReduced = result.duplicatesReduced ?? 0;
  const adopted = suggestions.filter((item) => {
    const key = candidateKey(item);
    if (semanticSeen.has(key)) {
      duplicateEvidence.push(structuredClone(item));
      duplicatesReduced++;
      return false;
    }
    semanticSeen.add(key);
    return true;
  });
  return {
    ...q,
    takeoff: [
      ...q.takeoff,
      ...consolidateBeamReviews(adopted).map((item) => {
        if (item.status === "Rejected") return item;
        const source = drawingSuggestions.find(
          (s) =>
            s.documentId === item.documentId &&
            s.page === item.page &&
            s.description === item.description &&
            s.specification === item.specification,
        );
        const calculation =
          proposedBeamRecipe(
            source
              ? {
                  ...item,
                  confidence: source.confidence,
                  quantity: source.quantity,
                  unit: source.unit,
                }
              : item,
          ) ?? proposedMaterialRecipe(item);
        return calculation
          ? {
              ...item,
              materialInputs: preservedDrawingInputs(item),
              calculation,
              quantity: null,
              unit: calculateMaterial(calculation, false).unit || item.unit,
              quantityMethod: "Unknown" as const,
              classification: "Contractor input required" as const,
              notes: [
                item.notes,
                (source?.quantity ?? item.quantity) !== null
                  ? `Original proposed observation: ${source?.quantity ?? item.quantity} ${source?.unit ?? item.unit}; not a verified purchase quantity.`
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
            }
          : item;
      }),
    ],
    analysisReports: [
      ...(q.analysisReports ?? []),
      {
        id: analysisId,
        fingerprint: fingerprint ?? id(),
        createdAt: new Date().toISOString(),
        project: result.project,
        summary: result.summary,
        duplicatesReduced,
        ...(duplicateEvidence.length ? { duplicateEvidence } : {}),
        sourceDocuments: analyzedDocuments.map((d) => ({
          id: d.id,
          name: d.name,
        })),
        dimensions: result.dimensions,
        dimensionDecisions: result.dimensionDecisions,
        sourceObservations: structuredClone(result.sourceObservations ?? []),
        assumptions: result.assumptions ?? [],
        warnings: result.warnings,
      },
    ],
  };
}
export function editTakeoff(
  item: TakeoffItem,
  delta: Partial<TakeoffItem>,
): TakeoffItem {
  const scopeOnly = Object.keys(delta).every(
    (key) =>
      key === "scopeVerified" ||
      key === "included" ||
      key === "purchaseVerified" ||
      key === "conflictsVerified",
  );
  const beamScopeConfirmation =
    Object.keys(delta).every((key) =>
      ["scopeVerified", "workScope", "included"].includes(key),
    ) &&
    delta.scopeVerified === true &&
    delta.workScope === "New work" &&
    delta.included === true &&
    item.beamAssemblies?.some((b) => b.scope === "Requires scope confirmation");
  const calculation =
    "calculation" in delta
      ? delta.calculation
      : item.calculation && !scopeOnly && !beamScopeConfirmation
        ? { ...item.calculation, verified: false }
        : item.calculation;
  return {
    ...item,
    ...delta,
    conflictsVerified:
      delta.conflictsVerified ?? (scopeOnly ? item.conflictsVerified : false),
    purchaseVerified:
      delta.purchaseVerified ?? (scopeOnly ? item.purchaseVerified : false),
    calculation,
    ...(calculation && !calculation.verified ? { quantity: null } : {}),
    status: "Proposed",
    reviewAcknowledged: false,
    scopeVerified: beamScopeConfirmation
      ? true
      : scopeOnly
        ? (delta.scopeVerified ?? item.scopeVerified)
        : false,
  };
}
export function reviewTakeoff(item: TakeoffItem): TakeoffItem {
  if (completenessProblem(item)) throw new Error(completenessProblem(item));
  if (purchaseQuantityProblem(item))
    throw new Error(purchaseQuantityProblem(item));
  if (!includedScope(item))
    throw new Error(
      "Explicitly include and verify existing/by-others work before review; confirm contract scope.",
    );
  if (item.calculation) {
    if (!item.specification?.trim())
      throw new Error(
        "Enter and verify the selected material specification before calculator review.",
      );
    const result = calculateMaterial(item.calculation);
    if (
      result.quantity === null ||
      result.quantity !== item.quantity ||
      result.unit !== item.unit
    )
      throw new Error(
        "Complete and verify all calculator inputs before review.",
      );
  }
  if (requiresScopeVerification(item) && !item.scopeVerified)
    throw new Error(
      "Verify existing/new/by-others status and confirm this item is included in your contract scope before reviewing.",
    );
  if (
    item.quantity === null ||
    !Number.isFinite(item.quantity) ||
    item.quantity < 0 ||
    !item.description.trim() ||
    !item.unit.trim()
  )
    throw new Error(
      "Enter the missing quantity, description and unit before marking reviewed.",
    );
  return { ...item, status: "Reviewed", reviewAcknowledged: true };
}
export function approveTakeoff(item: TakeoffItem): TakeoffItem {
  if (completenessProblem(item)) throw new Error(completenessProblem(item));
  if (purchaseQuantityProblem(item))
    throw new Error(purchaseQuantityProblem(item));
  if (!includedScope(item))
    throw new Error("Explicitly include excluded scope before approval.");
  if (
    item.calculation &&
    calculateMaterial(item.calculation).quantity !== item.quantity
  )
    throw new Error("Verify calculator inputs before approval.");
  if (requiresScopeVerification(item) && !item.scopeVerified)
    throw new Error("Confirm contract scope inclusion before approval.");
  if (
    item.status !== "Reviewed" ||
    (item.origin === "ai" && !item.reviewAcknowledged)
  )
    throw new Error(
      "Review this proposed item first, including its source, assumptions and uncertainty.",
    );
  if (
    item.quantity === null ||
    !Number.isFinite(item.quantity) ||
    item.quantity < 0
  )
    throw new Error("Verify the quantity before approval.");
  return { ...item, status: "Approved" };
}
export function canConvert(item: TakeoffItem): boolean {
  return (
    !completenessProblem(item) &&
    includedScope(item) &&
    !purchaseQuantityProblem(item) &&
    (!item.calculation ||
      (calculateMaterial(item.calculation).quantity === item.quantity &&
        item.quantity !== null)) &&
    (!requiresScopeVerification(item) || !!item.scopeVerified) &&
    !item.convertedLineId &&
    item.quantity !== null &&
    item.destination !== "Informational" &&
    (item.status === "Approved" ||
      (item.status === "Reviewed" && item.origin !== "ai"))
  );
}

export function approveTakeoffBatch(q: Quote, items: TakeoffItem[]): Quote {
  const approved = items.map((item) => approveTakeoff(item));
  const next = {
    ...q,
    takeoff: q.takeoff.map(
      (item) => approved.find((a) => a.id === item.id) ?? item,
    ),
  };
  approved.forEach((item) => assertScope(next, item));
  return next;
}
