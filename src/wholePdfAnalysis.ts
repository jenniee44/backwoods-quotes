import type { AnalysisDocument } from "../shared/analysis";
import { validateDocuments } from "../shared/analysis";
import {
  analysisPackageSize,
  dataBytes,
  maxAnalysisBytes,
} from "../shared/analysisPackage";
import { loadPdfSource } from "./pdfSource";
import { generatePdfDetails } from "./generatePdfDetails";
/** Automatic supplements are optional reading aids, not extra material occurrences.
 * Complete original bytes/text always remain the authoritative input.
 * Existing explicit detail selections are never changed or silently omitted.
 */
export async function supplementWholePdfs(
  documents: AnalysisDocument[],
  signal: AbortSignal,
  progress: (s: string) => void = () => {},
  readingBudget = 8,
  pageTurns: Record<
    string,
    Record<number, import("../shared/pdf").PdfRotation>
  > = {},
) {
  const result = structuredClone(documents);
  const notes: string[] = [];
  const reviewViews: {
    documentId: string;
    region: import("./detailReadability").PreparedDetail;
  }[] = [];
  let remaining = maxAnalysisBytes - analysisPackageSize(result).total;
  let capacity = Math.min(
    [4, 8, 12].includes(readingBudget) ? readingBudget : 8,
    24 - analysisPackageSize(result).detailCount,
  );
  for (const d of result) {
    signal.throwIfAborted();
    if (d.type !== "application/pdf" || d.detailRegions?.length) continue;
    if (remaining <= 0 || capacity === 0) {
      notes.push(
        d.name +
          ": original PDF included; automatic fine-detail supplement budget exhausted.",
      );
      continue;
    }
    let task: Awaited<ReturnType<typeof loadPdfSource>> | undefined;
    const cancel = () => {
      void task?.destroy().catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      task = await loadPdfSource(d.data);
      const pdf = await task.promise;
      const generated = await generatePdfDetails(
        pdf,
        signal,
        capacity,
        [],
        progress,
        "analysis",
        pageTurns[d.id] ?? {},
      );
      const included = [];
      let skipped = 0;
      let uncertain = 0;
      for (const view of generated.views) {
        signal.throwIfAborted();
        const bytes = dataBytes(view.data);
        if (bytes > remaining) {
          skipped++;
          continue;
        }
        // Only schema-approved location/encoding metadata goes to the server.
        const {
          inspectionNote,
          orientationUncertain,
          cropNeedsReview,
          reviewGroup,
          ...region
        } = view;
        included.push(region);
        remaining -= bytes;
        capacity--;
        reviewViews.push({ documentId: d.id, region: view });
        if (orientationUncertain || cropNeedsReview) uncertain++;
        void inspectionNote;
        void reviewGroup;
      }
      if (included.length) d.detailRegions = included;
      if (uncertain)
        notes.push(
          `${d.name}: ${uncertain} automatic reading images need orientation/crop inspection. Open View AI Detail Images after analysis. Unreadable details still require contractor input.`,
        );
      notes.push(
        d.name +
          ": " +
          pdf.numPages +
          " complete PDF page(s) included; " +
          included.length +
          " automatic 250 DPI reading supplement(s). No manual crops required.",
      );
      if (generated.scans)
        notes.push(
          d.name +
            ": " +
            generated.scans +
            " page(s) have no selectable text. Supplements do not add information to low-resolution scans; no OCR guesses.",
        );
      if (skipped || generated.errors.length)
        notes.push(
          d.name +
            ": " +
            (skipped + generated.errors.length) +
            " optional supplement(s) could not fit or render; complete original PDF remains included.",
        );
    } catch (e) {
      signal.throwIfAborted();
      notes.push(
        d.name +
          ": automatic fine-detail preparation unavailable; complete original PDF and selectable text still included. " +
          (e as Error).message,
      );
    } finally {
      signal.removeEventListener("abort", cancel);
      await task?.destroy();
    }
  }
  signal.throwIfAborted();
  return { documents: validateDocuments(result), notes, reviewViews };
}
