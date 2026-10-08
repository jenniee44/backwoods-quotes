import { validateDocuments, validateAnalysis } from "../shared/analysis";
import type {
  AnalysisDocument,
  PlanAnalysisResult,
  AnalysisSuggestion,
  ContractorSummary,
} from "../shared/analysis";
import {
  analysisPackageSize,
  dataBytes,
  maxAnalysisBytes,
} from "../shared/analysisPackage";
import { maxDetailRegions } from "../shared/pdf";
export type AnalysisBatch = {
  documents: AnalysisDocument[];
  indices: Record<string, number[]>;
};
export function analysisBatches(sources: AnalysisDocument[]): AnalysisBatch[] {
  const originals = sources.map((d) => {
    const copy = { ...d };
    delete copy.detailRegions;
    return copy;
  });
  validateDocuments(originals);
  if (
    sources.reduce((n, d) => n + (d.detailRegions?.length ?? 0), 0) >
    maxDetailRegions
  )
    throw new Error("Include up to 24 detail views.");
  const batches: AnalysisBatch[] = [];
  const fresh = (): AnalysisBatch => ({
    documents: originals.map((d) => ({ ...d })),
    indices: {},
  });
  let batch = fresh();
  let bytes = analysisPackageSize(originals).total;
  for (const source of sources)
    for (const [index, region] of (source.detailRegions ?? []).entries()) {
      const size = dataBytes(region.data);
      if (analysisPackageSize(originals).total + size > maxAnalysisBytes)
        throw new Error(
          "A detail cannot fit beside the selected original files. Select fewer source documents or a smaller detail region.",
        );
      if (bytes + size > maxAnalysisBytes) {
        validateDocuments(batch.documents);
        batches.push(batch);
        batch = fresh();
        bytes = analysisPackageSize(originals).total;
      }
      const target = batch.documents.find((d) => d.id === source.id)!;
      target.detailRegions = [...(target.detailRegions ?? []), region];
      batch.indices[source.id] = [
        ...(batch.indices[source.id] ?? []),
        index + 1,
      ];
      bytes += size;
    }
  validateDocuments(batch.documents);
  batches.push(batch);
  return batches;
}
export async function analyzeBatches(
  sources: AnalysisDocument[],
  signal: AbortSignal,
  analyze: (
    d: AnalysisDocument[],
    s: AbortSignal,
  ) => Promise<PlanAnalysisResult>,
  progress: (n: number, total: number) => void = () => {},
): Promise<PlanAnalysisResult> {
  const batches = analysisBatches(sources);
  const results: PlanAnalysisResult[] = [];
  for (const [index, batch] of batches.entries()) {
    signal.throwIfAborted();
    progress(index + 1, batches.length);
    const result = await analyze(batch.documents, signal);
    const remap = (items: AnalysisSuggestion[] | undefined) =>
      items?.map((item) => ({
        ...item,
        ...(item.sourceDetailView
          ? {
              sourceDetailView:
                batch.indices[item.documentId]?.[item.sourceDetailView - 1],
            }
          : {}),
      }));
    results.push({
      ...result,
      suggestions: remap(result.suggestions)!,
      dimensions: remap(result.dimensions),
      sourceObservations: remap(result.sourceObservations),
    });
  }
  signal.throwIfAborted();
  if (results.length === 1) return results[0];
  if (
    results.reduce((n, r) => n + r.suggestions.length, 0) > 150 ||
    results.reduce((n, r) => n + (r.dimensions?.length ?? 0), 0) > 100 ||
    results.reduce((n, r) => n + (r.sourceObservations?.length ?? 0), 0) > 100
  )
    throw new Error(
      "Combined batched analysis exceeds the safe review limits (150 candidates / 100 dimensions / 100 source observations). Analyze fewer details. No partial takeoff was added.",
    );
  const unique = (values: string[]) => [...new Set(values)];
  const summaries = results.flatMap((r) => (r.summary ? [r.summary] : []));
  const summary = summaries.length
    ? (Object.fromEntries(
        Object.keys(summaries[0]).map((k) => [
          k,
          unique(summaries.flatMap((s) => s[k as keyof ContractorSummary])),
        ]),
      ) as ContractorSummary)
    : undefined;
  // Preserve every candidate and source reference; existing semantic consolidation
  // handles duplicates. If bounded result limits are exceeded, fail atomically.
  return validateAnalysis(
    {
      project: results[0].project,
      summary,
      suggestions: results.flatMap((r) => r.suggestions),
      dimensions: results.flatMap((r) => r.dimensions ?? []),
      sourceObservations: results.flatMap((r) => r.sourceObservations ?? []),
      warnings: unique(
        results.flatMap((r, i) => [
          ...r.warnings,
          `Batch ${i + 1} of ${results.length}: original PDFs repeated; cross-view overlaps require contractor review.`,
          ...(r.project
            ? [`Batch ${i + 1} project context: ${JSON.stringify(r.project)}`]
            : []),
        ]),
      ),
      assumptions: unique(results.flatMap((r) => r.assumptions ?? [])),
    },
    sources.map((d) => d.id),
    sources,
  );
}
