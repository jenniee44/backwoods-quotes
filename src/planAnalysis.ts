import { id, categories, normalizeCategory } from "./model";
import type { PlanDocument, Quote, TakeoffItem } from "./model";
import { validateAnalysis, validateDocuments } from "../shared/analysis";
import type {
  PlanAnalysisResult,
  AnalysisSuggestion,
} from "../shared/analysis";
export type { PlanAnalysisResult, AnalysisSuggestion };
export interface PlanAnalysisService {
  analyze(
    documents: PlanDocument[],
    signal?: AbortSignal,
  ): Promise<PlanAnalysisResult>;
}
export const planAnalysisService: PlanAnalysisService = {
  async analyze(documents, signal) {
    const payload = validateDocuments(documents);
    let response: Response;
    try {
      response = await fetch("/api/plan-analysis", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: payload }),
        signal,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      throw new Error(
        "The analysis service could not be reached. Check your connection or sign in through Cloudflare Access.",
      );
    }
    if (!response.headers.get("Content-Type")?.includes("application/json"))
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
    if (!response.ok)
      throw new Error(
        typeof body?.error === "string"
          ? body.error
          : "Plan analysis failed. Try again or use manual takeoff.",
      );
    return validateAnalysis(
      body,
      documents.map((d) => d.id),
    );
  },
};
export async function documentFingerprint(
  documents: PlanDocument[],
): Promise<string> {
  // SubtleCrypto is unavailable on unsecured LAN HTTP previews; don't weaken hashes.
  if (!crypto.subtle)
    throw new Error(
      "Analyze plans requires HTTPS or a local localhost connection.",
    );
  const bytes = new TextEncoder().encode(
    JSON.stringify(
      documents.map((d) => ({ id: d.id, type: d.type, data: d.data })),
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
  const analysisId = id();
  const suggestions = [
    ...result.suggestions,
    ...(result.dimensions ?? []).map((item) => ({
      ...item,
      destination: "Informational" as const,
    })),
  ].map((item) => {
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
      category: categories.includes(
        normalizeCategory(item.category ?? "Miscellaneous", item.description),
      )
        ? normalizeCategory(item.category ?? "Miscellaneous", item.description)
        : "Miscellaneous",
      destination: item.destination ?? "Informational",
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
  const seen = new Set(
    q.takeoff.map((item) => item.analysisSourceKey).filter(Boolean),
  );
  return {
    ...q,
    takeoff: [
      ...q.takeoff,
      ...suggestions.filter((item) => {
        if (seen.has(item.analysisSourceKey)) return false;
        seen.add(item.analysisSourceKey);
        return true;
      }),
    ],
    analysisReports: [
      ...(q.analysisReports ?? []),
      {
        id: analysisId,
        fingerprint: fingerprint ?? id(),
        createdAt: new Date().toISOString(),
        project: result.project,
        dimensions: result.dimensions,
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
  return { ...item, ...delta, status: "Proposed", reviewAcknowledged: false };
}
export function reviewTakeoff(item: TakeoffItem): TakeoffItem {
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
  if (
    item.origin === "ai" &&
    (item.status !== "Reviewed" || !item.reviewAcknowledged)
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
    !item.convertedLineId &&
    item.quantity !== null &&
    item.destination !== "Informational" &&
    (item.status === "Approved" ||
      (item.status === "Reviewed" && item.origin !== "ai"))
  );
}
