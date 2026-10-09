import { useEffect, useRef, useState } from "react";
import { loadPdfSource, renderPdfDetail } from "./pdfSource";
import { selectDetailRegions } from "./autoDetailRegions";
import { orientDetail, textBounds } from "./detailReadability";
import type { PreparedDetail } from "./detailReadability";
import type { DetailSuggestion, TextMark } from "./autoDetailRegions";
import type { PlanDocument } from "./model";
import { readableRotation } from "./pdfOrientation";
import { contentRegions, surveyPixels } from "./drawingContent";
import type { PdfDetailRegion } from "../shared/pdf";
export default function AutoDetailSelection({
  source,
  existing,
  remainingAutomatic,
  remainingCapacity,
  disabled,
  onBusy,
  onAdd,
}: {
  source: PlanDocument;
  existing: PdfDetailRegion[];
  remainingAutomatic: number;
  remainingCapacity: number;
  disabled: boolean;
  onBusy: (b: boolean) => void;
  onAdd: (r: PreparedDetail[]) => void;
}) {
  const [running, setRunning] = useState(false),
    [message, setMessage] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    setMessage("");
    return () => controller.current?.abort();
  }, [source.id, source.data]);
  async function generate() {
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    onBusy(true);
    setMessage("Finding drawing notes and details…");
    let task: Awaited<ReturnType<typeof loadPdfSource>> | undefined;
    let rendered = 0;
    try {
      task = await loadPdfSource(source.data);
      const pdf = await task.promise;
      if (pdf.numPages > 50)
        throw new Error(
          "Split drawings into files of 50 pages or fewer before generating detail views.",
        );
      const candidates: DetailSuggestion[] = [];
      let scans = 0;
      let corrected = 0;
      let detailCorrected = 0;
      for (let page = 1; page <= Math.min(pdf.numPages, 50); page++) {
        abort.signal.throwIfAborted();
        setMessage(`Inspecting page ${page} of ${pdf.numPages}…`);
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
            ...contentRegions(page, v.width, v.height, marks, survey).map(
              (r) => ({
                ...r,
                rotation: orientation.rotation,
                pageWidth: v.width,
                pageHeight: v.height,
              }),
            ),
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
      const selected = selectDetailRegions(
        candidates,
        Math.min(remainingAutomatic, remainingCapacity),
        prior,
      );
      const views: PreparedDetail[] = [];
      const errors: string[] = [];
      for (const region of selected) {
        abort.signal.throwIfAborted();
        setMessage(
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
      abort.signal.throwIfAborted();
      rendered = views.length;
      onAdd(views);
      setMessage(
        `${rendered} suggested views generated. Inspect every view before analysis. ${scans ? `${scans} scanned page(s): visible-content suggestions, not OCR; orientation needs contractor verification. ` : ""}${corrected ? `${corrected} page orientation(s) corrected using selectable text. ` : ""}${detailCorrected ? `${detailCorrected} detail orientation(s) corrected independently using local text. ` : ""}${!rendered ? "No additional readable content regions found. Use manual selection if needed. " : ""}${errors.length ? `${errors.length} regions could not be rendered within safe limits. ` : ""}Up to 20 automatic views / 24 total, 50 pages; suggestions may miss details. Original PDF remains included. Each analysis request must fit 8 MB; larger detail sets use bounded batches with the originals in each.`,
      );
    } catch (e) {
      if (!abort.signal.aborted) setMessage((e as Error).message);
      else setMessage("Detail generation cancelled. No new views were added.");
    } finally {
      await task?.destroy();
      if (controller.current === abort) {
        setRunning(false);
        onBusy(false);
      }
    }
  }
  return (
    <section className="info">
      <button
        className="button secondary"
        disabled={
          disabled ||
          running ||
          remainingCapacity <= 0 ||
          remainingAutomatic <= 0
        }
        onClick={() => void generate()}
      >
        Auto-Generate Detail Views
      </button>
      {running && (
        <button
          className="button secondary"
          onClick={() => controller.current?.abort()}
        >
          Cancel detail generation
        </button>
      )}
      <p className="tiny">
        Find selectable construction notes, dimensions and details. Small text
        is prioritized; empty regions are filtered using a content survey.
        Scanned text orientation must be checked manually. No OCR or measurement
        guesses. Review and adjust all suggestions.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
