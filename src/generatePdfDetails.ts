import type { PDFDocumentProxy } from "pdfjs-dist";
import { renderPdfDetail } from "./pdfSource";
import { selectDetailRegions } from "./autoDetailRegions";
import type { DetailSuggestion, TextMark } from "./autoDetailRegions";
import { orientDetail, textBounds } from "./detailReadability";
import type { PreparedDetail } from "./detailReadability";
import { readableRotation } from "./pdfOrientation";
import { contentRegions, surveyPixels } from "./drawingContent";
import type { PdfDetailRegion } from "../shared/pdf";
export async function generatePdfDetails(
  pdf: PDFDocumentProxy,
  signal: AbortSignal,
  limit: number,
  existing: PdfDetailRegion[] = [],
  progress: (s: string) => void = () => {},
) {
  if (pdf.numPages > 50)
    throw new Error("PDF exceeds the 50-page analysis limit.");
  const candidates: DetailSuggestion[] = [];
  let scans = 0;
  let corrected = 0;
  let detailCorrected = 0;
  for (let page = 1; page <= Math.min(pdf.numPages, 50); page++) {
    signal.throwIfAborted();
    progress(`Inspecting page ${page} of ${pdf.numPages}…`);
    const p = await pdf.getPage(page);
    const content = await p.getTextContent().catch(() => ({ items: [] }));
    const orientation = readableRotation(
      p.rotate,
      content.items.flatMap((i) => ("str" in i ? [i] : [])),
    );
    if (orientation.rotation !== p.rotate) corrected++;
    const v = p.getViewport({ scale: 1, rotation: orientation.rotation });
    const marks: TextMark[] = content.items.flatMap((item) => {
      if (!("str" in item)) return [];
      return [{ text: item.str, ...textBounds(item, v) }];
    });
    if (!marks.some((m) => m.text.trim())) scans++;
    const canvas = document.createElement("canvas");
    const viewport = p.getViewport({
      scale: Math.min(1600 / v.width, 1600 / v.height),
      rotation: orientation.rotation,
    });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error(
        "Drawing-content detection unavailable. Use manual detail selection.",
      );
    try {
      await p.render({ canvas, canvasContext: context, viewport }).promise;
      const survey = surveyPixels(
        canvas.width,
        canvas.height,
        context.getImageData(0, 0, canvas.width, canvas.height).data,
      );
      candidates.push(
        ...contentRegions(page, v.width, v.height, marks, survey).map((r) => ({
          ...r,
          rotation: orientation.rotation,
          pageWidth: v.width,
          pageHeight: v.height,
        })),
      );
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      p.cleanup();
    }
  }
  // Compare only matching absolute page orientations; never replace manual captures.
  const prior = existing.map((r) => ({
    ...r,
    label: "Existing",
    score: 0,
  }));
  const selected = selectDetailRegions(candidates, limit, prior);
  const views: PreparedDetail[] = [];
  const errors: string[] = [];
  for (const region of selected) {
    signal.throwIfAborted();
    progress(
      `Rendering detail ${views.length + 1} of ${selected.length} at 250 DPI…`,
    );
    const p = await pdf.getPage(region.page);
    try {
      const content = await p.getTextContent().catch(() => ({ items: [] }));
      const oriented = orientDetail(
        p,
        region,
        content.items.flatMap((i) => ("str" in i ? [i] : [])),
      );
      const capture = await renderPdfDetail(p, oriented, oriented.rotation);
      if (oriented.rotation !== region.rotation) detailCorrected++;
      views.push({
        ...capture,
        label: region.label,
        reviewGroup: oriented.reviewGroup,
        orientationUncertain: oriented.orientationUncertain,
        cropNeedsReview: !!region.inspectionNote,
        inspectionNote: [oriented.inspectionNote, region.inspectionNote]
          .filter(Boolean)
          .join(" "),
      });
    } catch (e) {
      errors.push((e as Error).message);
    } finally {
      p.cleanup();
    }
  }

  return { views, scans, corrected, detailCorrected, errors };
}
