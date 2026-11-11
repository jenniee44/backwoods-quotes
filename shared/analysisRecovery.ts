import {
  validateAnalysis,
  type AnalysisDocument,
  type PlanAnalysisResult,
} from "./analysis";
export type AnalysisIdentity = {
  analysisId: string;
  quoteId: string;
  batchIndex: number;
  batchCount: number;
  indices: Record<string, number[]>;
};
export async function digest(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export const sourceDigest = (documents: AnalysisDocument[]) =>
  digest(
    JSON.stringify(
      documents.map((d) => ({ id: d.id, type: d.type, data: d.data })),
    ),
  );
/** Remap validated batch-local detail references once. Never persist source bytes. */
export function globalAnalysis(
  result: PlanAnalysisResult,
  documents: AnalysisDocument[],
  indices: Record<string, number[]>,
) {
  const next = structuredClone(result);
  for (const list of [
    next.suggestions,
    next.dimensions ?? [],
    next.sourceObservations ?? [],
  ])
    for (const item of list) {
      if (!item.sourceDetailView) continue;
      const region = documents.find((d) => d.id === item.documentId)
        ?.detailRegions?.[item.sourceDetailView - 1];
      const global = indices[item.documentId]?.[item.sourceDetailView - 1];
      if (
        !region ||
        !Number.isInteger(global) ||
        global < 1 ||
        global > 24 ||
        region.page !== item.page
      )
        throw new Error("Invalid submitted detail reference.");
      item.sourceDetailView = global;
      const note = `Submitted source: ${item.documentId}, page ${region.page}, detail ${global}, region ${region.x},${region.y},${region.width},${region.height} PDF points; rotation ${region.rotation ?? 0} degrees; ${region.dpi} DPI.`;
      const facts = item.sourceFacts ?? [];
      if (facts.includes(note)) continue;
      if (facts.length < 20) item.sourceFacts = [...facts, note];
      else if ((item.notes + " " + note).length <= 2000)
        item.notes += " " + note;
      else throw new Error("Detail provenance exceeds safe review limits.");
    }
  return next;
}
export function combineAnalyses(results: PlanAnalysisResult[], ids: string[]) {
  if (!results.length) throw new Error("No completed analysis batches.");
  if (results.length === 1) return validateAnalysis(results[0], ids);
  const unique = (a: string[]) => [...new Set(a)];
  const summaries = results.flatMap((r) => (r.summary ? [r.summary] : []));
  return validateAnalysis(
    {
      project: results[0].project,
      ...(summaries.length
        ? {
            summary: Object.fromEntries(
              Object.keys(summaries[0]).map((k) => [
                k,
                unique(summaries.flatMap((s) => s[k as keyof typeof s])),
              ]),
            ),
          }
        : {}),
      suggestions: results.flatMap((r) => r.suggestions),
      dimensions: results.flatMap((r) => r.dimensions ?? []),
      sourceObservations: results.flatMap((r) => r.sourceObservations ?? []),
      assumptions: unique(results.flatMap((r) => r.assumptions ?? [])),
      warnings: unique(results.flatMap((r) => r.warnings)),
    },
    ids,
  );
}
