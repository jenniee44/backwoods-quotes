import { useEffect, useRef, useState } from "react";
import { loadPdfSource, renderPdfDetail } from "./pdfSource";
import { suggestPageRegions, selectDetailRegions } from "./autoDetailRegions";
import type { DetailSuggestion, TextMark } from "./autoDetailRegions";
import type { PlanDocument } from "./model";
import { normalizeRotation } from "../shared/pdf";
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
  onAdd: (r: PdfDetailRegion[]) => void;
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
      for (let page = 1; page <= Math.min(pdf.numPages, 50); page++) {
        abort.signal.throwIfAborted();
        setMessage(`Inspecting page ${page} of ${pdf.numPages}…`);
        const p = await pdf.getPage(page);
        const v = p.getViewport({ scale: 1 });
        const content = await p.getTextContent().catch(() => ({ items: [] }));
        const marks: TextMark[] = content.items.flatMap((item) => {
          if (!("str" in item)) return [];
          const [x, y] = v.convertToViewportPoint(
            item.transform[4],
            item.transform[5],
          );
          return [
            { text: item.str, x, y, width: item.width, height: item.height },
          ];
        });
        if (!marks.some((m) => m.text.trim())) scans++;
        candidates.push(
          ...suggestPageRegions(page, v.width, v.height, marks).map((r) => ({
            ...r,
            rotation: normalizeRotation(p.rotate),
            pageWidth: v.width,
            pageHeight: v.height,
          })),
        );
        p.cleanup();
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
      const views: PdfDetailRegion[] = [];
      const errors: string[] = [];
      for (const region of selected) {
        abort.signal.throwIfAborted();
        setMessage(
          `Rendering detail ${views.length + 1} of ${selected.length} at 250 DPI…`,
        );
        const p = await pdf.getPage(region.page);
        try {
          views.push({
            ...(await renderPdfDetail(p, {
              x: region.x,
              y: region.y,
              width: region.width,
              height: region.height,
            })),
            label: region.label,
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
        `${rendered} suggested views generated. Inspect every view before analysis. ${scans ? `${scans} scanned page(s): geometric regions only, not detected drawing content. ` : ""}${errors.length ? `${errors.length} regions could not be rendered within safe limits. ` : ""}Up to 20 automatic views / 24 total, 50 pages; suggestions may miss details. Original PDF remains included. Each analysis request must fit 8 MB; larger detail sets use bounded batches with the originals in each.`,
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
        is prioritized; scanned sheets receive coverage suggestions. No OCR or
        measurement guesses. Review and adjust all suggestions.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
