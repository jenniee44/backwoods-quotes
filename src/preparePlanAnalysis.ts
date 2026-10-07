import type { AnalysisDocument } from "../shared/analysis";
import { validateDocuments } from "../shared/analysis";
import { maxAnalysisTextChars } from "../shared/pdf";
import { loadPdfSource, extractPdfText } from "./pdfSource";
export async function preparePlanAnalysis(
  documents: AnalysisDocument[],
  signal?: AbortSignal,
): Promise<AnalysisDocument[]> {
  const sources = validateDocuments(documents);
  let budget = maxAnalysisTextChars;
  for (const source of sources) {
    signal?.throwIfAborted();
    if (source.type !== "application/pdf") continue;
    const task = await loadPdfSource(source.data);
    const cancel = () => {
      void task.destroy().catch(() => {});
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 50)
        throw new Error("Split drawings into files of 50 pages or fewer.");
      source.pdfText = await extractPdfText(pdf, budget, signal);
      budget -= source.pdfText.pages.reduce(
        (sum, page) => sum + page.text.length,
        0,
      );
    } finally {
      signal?.removeEventListener("abort", cancel);
      await task.destroy();
    }
  }
  // No canvas/thumbnail is used here. Original source bytes remain identical.
  return validateDocuments(sources);
}
