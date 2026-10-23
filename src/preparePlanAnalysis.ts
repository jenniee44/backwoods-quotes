import { vectorGeometry } from "./pdfVectorGeometry";
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
  let geometryRemaining = 480; // Whole-request geometry record budget, not per PDF.
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
      const { OPS } = await import("pdfjs-dist");
      for (const layer of source.pdfText.pages) {
        signal?.throwIfAborted();
        if (
          !layer.positions?.some((p) =>
            /\b\d+\s*[- ]?ply\b|\bbeams?\b|\bgirders?\b/i.test(p.text),
          )
        )
          continue;
        const page = await pdf.getPage(layer.page);
        try {
          if (geometryRemaining <= 0) {
            layer.vectorGeometry = { segments: [], boxes: [], truncated: true };
            continue;
          }
          layer.vectorGeometry = vectorGeometry(
            await page.getOperatorList(),
            OPS,
            page.getViewport({ scale: 1 }),
            layer.positions ?? [],
          );
          const geometry = layer.vectorGeometry;
          const segments = geometry.segments.slice(0, geometryRemaining);
          geometryRemaining -= segments.length;
          const boxes = geometry.boxes.slice(0, geometryRemaining);
          geometryRemaining -= boxes.length;
          layer.vectorGeometry = {
            segments,
            boxes,
            truncated:
              geometry.truncated ||
              segments.length < geometry.segments.length ||
              boxes.length < geometry.boxes.length,
          };
        } catch {
          signal?.throwIfAborted(); // Optional geometry failure cannot remove original PDF/text.
        } finally {
          page.cleanup();
        }
      }
      budget -= source.pdfText.pages.reduce(
        (sum, page) =>
          sum +
          page.text.length +
          (page.positions ?? []).reduce((n, r) => n + r.text.length, 0),
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
