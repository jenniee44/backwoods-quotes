import { markAnalysisTransport } from "./analysisTransport";
import {
  validateAnalysis,
  type AnalysisDocument,
  type PlanAnalysisResult,
} from "../shared/analysis";
import { combineAnalyses, sourceDigest } from "../shared/analysisRecovery";
import { abortableAnalysis } from "../shared/abortableAnalysis";
import { analysisErrors, isAnalysisErrorCode } from "../shared/analysisErrors";
export class RecoveryFailure extends Error {
  constructor(
    public state:
      | "missing"
      | "running"
      | "interrupted"
      | "storage-unavailable"
      | "service-unavailable"
      | "browser-storage-unavailable"
      | "failed",
    code?: unknown,
  ) {
    super(
      state === "missing"
        ? "No saved AI result was found for this quote and these files. This is not an AI-analysis failure. No paid AI request was made."
        : state === "running"
          ? "The existing analysis is still running. Check saved results again shortly; no paid AI request was made."
          : state === "interrupted"
            ? "The previous request has no completed saved result and is no longer marked running. Its provider outcome is uncertain. No paid AI request was made."
            : state === "service-unavailable"
              ? "The saved-results service could not be reached or requires sign-in. No AI request was made. Check your connection and Cloudflare Access sign-in."
              : state === "browser-storage-unavailable"
                ? "The browser checkpoint store could not be read, and a complete server result was not available. No paid AI request was made. Existing estimates are unchanged."
                : state === "storage-unavailable"
                  ? "Saved-result storage is unavailable in this deployment environment. No paid AI request was made. The owner must check ANALYSIS_RESULTS in this Pages environment."
                  : isAnalysisErrorCode(code)
                    ? `The previous attempt reported: ${analysisErrors[code].message} No new paid AI request was made.`
                    : "The previous analysis did not leave a valid completed result. No new paid AI request was made.",
    );
    this.name = "RecoveryFailure";
  }
}
export const recoveryHeading = (e: RecoveryFailure) =>
  ({
    missing: "No saved AI results found",
    running: "Analysis still running",
    interrupted: "Previous analysis interrupted",
    "storage-unavailable": "Saved-result storage unavailable",
    "service-unavailable": "Saved-results service unavailable",
    "browser-storage-unavailable": "Browser checkpoint storage unavailable",
    failed: "Previous analysis needs attention",
  })[e.state];
export async function recoverSavedAnalysis(
  documents: AnalysisDocument[],
  quoteId: string,
  signal: AbortSignal,
): Promise<PlanAnalysisResult> {
  const hash = await sourceDigest(documents);
  return abortableAnalysis(
    async (timeout) => {
      let response: Response;
      try {
        response = await fetch("/api/plan-analysis", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "recover",
            quoteId,
            sourceDigest: hash,
          }),
          signal: timeout,
        });
      } catch {
        throw new RecoveryFailure("service-unavailable");
      }
      const body = await response.json().catch(() => null);
      if (
        response.ok &&
        body?.state === "completed" &&
        body.persistence === "confirmed" &&
        Array.isArray(body.batches)
      ) {
        try {
          const result = combineAnalyses(
            body.batches.map((r: unknown) =>
              validateAnalysis(
                r,
                documents.map((d) => d.id),
              ),
            ),
            documents.map((d) => d.id),
          );
          for (const item of [
            ...result.suggestions,
            ...(result.dimensions ?? []),
            ...(result.sourceObservations ?? []),
          ]) {
            const source = documents.find((d) => d.id === item.documentId);
            if (
              source?.pdfText &&
              ((item.page ?? 1) > source.pdfText.pageCount ||
                item.beamAssemblies?.some(
                  (b) => b.page > source.pdfText!.pageCount,
                ))
            )
              throw new RecoveryFailure("failed");
          }
          return markAnalysisTransport(result, {
            global: true,
            persistence: "confirmed",
            analysisId: body.analysisId,
          });
        } catch {
          throw new RecoveryFailure("failed");
        }
      }
      throw new RecoveryFailure(
        [
          "missing",
          "running",
          "interrupted",
          "storage-unavailable",
          "failed",
        ].includes(body?.state)
          ? body.state
          : "service-unavailable",
        body?.code,
      );
    },
    signal,
    120000,
  );
}
