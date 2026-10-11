import { generatePdfDetails } from "./generatePdfDetails";
import { useEffect, useRef, useState } from "react";
import { loadPdfSource } from "./pdfSource";
import type { PreparedDetail } from "./detailReadability";
import type { PlanDocument } from "./model";
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
      const { views, scans, corrected, detailCorrected, errors } =
        await generatePdfDetails(
          pdf,
          abort.signal,
          Math.min(remainingAutomatic, remainingCapacity),
          existing,
          setMessage,
        );
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
