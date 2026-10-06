import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
export default function PdfPreview({ url }: { url: string }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let canceled = false;
    let cleanup: (() => void) | undefined;
    setDocument(null);
    setPage(1);
    setError("");
    void import("pdfjs-dist")
      .then((pdfjs) => {
        if (canceled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerURL;
        const task = pdfjs.getDocument({ url });
        cleanup = () => {
          void task.destroy();
        };
        return task.promise.then((d) => {
          if (!canceled) setDocument(d);
        });
      })
      .catch(() => {
        if (!canceled)
          setError(
            "This PDF could not be rendered. Download it to view in your PDF app.",
          );
      });
    return () => {
      canceled = true;
      cleanup?.();
    };
  }, [url]);
  useEffect(() => {
    if (!document) return;
    let canceled = false;
    let cancelRender: (() => void) | undefined;
    void document
      .getPage(page)
      .then((p) => {
        if (canceled || !canvas.current) return;
        const unscaled = p.getViewport({ scale: 1 });
        const viewport = p.getViewport({
          scale: Math.min(2, 900 / unscaled.width),
        });
        const context = canvas.current.getContext("2d");
        if (!context) return;
        canvas.current.width = viewport.width;
        canvas.current.height = viewport.height;
        const task = p.render({
          canvas: canvas.current,
          canvasContext: context,
          viewport,
        });
        cancelRender = () => task.cancel();
        return task.promise;
      })
      .catch((e) => {
        if (!canceled && e.name !== "RenderingCancelledException")
          setError(
            "Unable to display this page. Download the drawing to view it.",
          );
      });
    return () => {
      canceled = true;
      cancelRender?.();
    };
  }, [document, page]);
  if (error) return <p className="alert">{error}</p>;
  return (
    <div className="plan-preview pdf-preview">
      {!document && <p className="muted">Loading PDF…</p>}
      {document && (
        <div className="pdf-page-controls">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} / {document.numPages}
          </span>
          <button
            className="button secondary"
            disabled={page >= document.numPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
      <canvas
        className="pdf-canvas"
        ref={canvas}
        aria-label={`Drawing page ${page}`}
      />
    </div>
  );
}
