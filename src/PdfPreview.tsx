import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { previewRenderSize } from "../shared/pdf";
import type { PdfDetailRegion } from "../shared/pdf";
import { renderPdfDetail } from "./pdfSource";
export default function PdfPreview({
  url,
  onDetail,
  detailsDisabled = false,
  onDetailBusy,
}: {
  url: string;
  onDetail?: (detail: PdfDetailRegion) => void;
  detailsDisabled?: boolean;
  onDetailBusy?: (busy: boolean) => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<{
    page: number;
    width: number;
    height: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [zoom, setZoom] = useState<number | null>(null);
  const [box, setBox] = useState({ width: 300, height: 400, left: 0, top: 0 });
  const [rendering, setRendering] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pending = useRef<Promise<void>>(Promise.resolve());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let canceled = false;
    let cleanup: (() => void) | undefined;
    setDocument(null);
    setPage(1);
    setPageSize(null);
    setZoom(null);
    setError("");
    setDetailError("");
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
            "This PDF could not be rendered. Download the original to view in your PDF app.",
          );
      });
    return () => {
      canceled = true;
      onDetailBusy?.(false);
      cleanup?.();
    };
  }, [url, onDetailBusy]);
  useEffect(() => {
    if (!document) return;
    let canceled = false;
    void document
      .getPage(page)
      .then((p) => {
        if (canceled) return;
        const viewport = p.getViewport({ scale: 1 });
        setPageSize({ page, width: viewport.width, height: viewport.height });
        scroller.current?.scrollTo(0, 0);
        setBox((b) => ({ ...b, left: 0, top: 0 }));
      })
      .catch(() => {
        if (!canceled)
          setError(
            "Unable to read this PDF page. The original download is unchanged.",
          );
      });
    return () => {
      canceled = true;
    };
  }, [document, page]);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const measure = () =>
      setBox((b) => ({
        ...b,
        width: node.clientWidth || 300,
        height: node.clientHeight || 400,
        left: node.scrollLeft,
        top: node.scrollTop,
      }));
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [document]);
  const scale =
    zoom ?? (pageSize ? Math.min(1, box.width / pageSize.width) : 1);
  const cssWidth = pageSize ? pageSize.width * scale : box.width;
  const cssHeight = pageSize ? pageSize.height * scale : box.height;
  const left = Math.min(box.left, Math.max(0, cssWidth - box.width));
  const top = Math.min(box.top, Math.max(0, cssHeight - box.height));
  const visibleWidth = Math.min(box.width, cssWidth - left);
  const visibleHeight = Math.min(box.height, cssHeight - top);
  const pixels = previewRenderSize(
    visibleWidth,
    visibleHeight,
    window.devicePixelRatio || 1,
  );
  useEffect(() => {
    if (!document || !pageSize || pageSize.page !== page) return;
    let canceled = false;
    let task: RenderTask | undefined;
    const previous = pending.current;
    setRendering(true);
    const render = (async () => {
      // Serialize PDF.js canvas use, including cancellation during rapid scrolling.
      await previous;
      if (canceled) return;
      const p = await document.getPage(page);
      if (canceled || !canvas.current) return;
      const context = canvas.current.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      canvas.current.width = pixels.pixelWidth;
      canvas.current.height = pixels.pixelHeight;
      const viewport = p.getViewport({ scale: scale * pixels.density });
      task = p.render({
        canvas: canvas.current,
        canvasContext: context,
        viewport,
        transform: [1, 0, 0, 1, -left * pixels.density, -top * pixels.density],
      });
      await task.promise;
    })()
      .catch((e) => {
        if (!canceled && e.name !== "RenderingCancelledException")
          setError(
            "Unable to display this page. Download the original drawing to view it.",
          );
      })
      .finally(() => {
        if (!canceled) setRendering(false);
      });
    pending.current = render;
    return () => {
      canceled = true;
      task?.cancel();
    };
  }, [
    document,
    pageSize,
    page,
    scale,
    left,
    top,
    pixels.pixelWidth,
    pixels.pixelHeight,
    pixels.density,
  ]);
  function changeZoom(value: number | null) {
    const node = scroller.current;
    const centerX = (left + visibleWidth / 2) / scale;
    const centerY = (top + visibleHeight / 2) / scale;
    setZoom(value);
    requestAnimationFrame(() => {
      if (!node || !pageSize) return;
      const next = value ?? Math.min(1, node.clientWidth / pageSize.width);
      node.scrollTo(
        Math.max(0, centerX * next - node.clientWidth / 2),
        Math.max(0, centerY * next - node.clientHeight / 2),
      );
    });
  }
  async function includeDetail() {
    if (!document || !pageSize || !onDetail || capturing) return;
    onDetailBusy?.(true);
    setCapturing(true);
    setDetailError("");
    const work = (async () => {
      try {
        const p = await document.getPage(page);
        // Separate high-resolution rendering from original operators, NEVER copy
        // or upscale the preview canvas. Cap size by refusing oversized regions.
        const detail = await renderPdfDetail(p, {
          x: left / scale,
          y: top / scale,
          width: visibleWidth / scale,
          height: visibleHeight / scale,
        });
        if (active.current) onDetail(detail);
      } catch (e) {
        if (active.current) setDetailError((e as Error).message);
      } finally {
        if (active.current) {
          setCapturing(false);
          onDetailBusy?.(false);
        }
      }
    })();
    await work;
  }
  if (error) return <p className="alert">{error}</p>;
  return (
    <div className="plan-preview pdf-preview">
      {!document && <p className="muted">Loading original PDF…</p>}
      {document && (
        <>
          <div className="pdf-page-controls">
            <button
              className="button secondary"
              disabled={page <= 1 || capturing}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} / {document.numPages}
            </span>
            <button
              className="button secondary"
              disabled={page >= document.numPages || capturing}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
          <div className="pdf-zoom-controls">
            <label className="field">
              <span>Zoom drawing</span>
              <select
                value={zoom ?? "fit"}
                disabled={capturing}
                onChange={(e) =>
                  changeZoom(
                    e.target.value === "fit" ? null : Number(e.target.value),
                  )
                }
              >
                <option value="fit">Fit sheet</option>
                {[0.25, 0.5, 1, 2, 3, 4].map((z) => (
                  <option key={z} value={z}>
                    {z * 100}%
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={capturing || scale >= 4}
              onClick={() =>
                changeZoom(
                  [0.25, 0.5, 1, 2, 3, 4].find((z) => z > scale + 0.001) ?? 4,
                )
              }
            >
              Zoom in
            </button>
            <button
              className="button secondary"
              disabled={capturing || zoom === null}
              onClick={() => changeZoom(null)}
            >
              Fit sheet
            </button>
          </div>
          <p className="tiny">
            Fit sheet is for navigation. Zoom and scroll to read small notes;
            each view is re-rendered from the original PDF, not enlarged preview
            pixels.
          </p>
        </>
      )}
      <div
        className="pdf-scroll-viewport"
        ref={scroller}
        onScroll={(e) => {
          const node = e.currentTarget;
          setBox((b) => ({ ...b, left: node.scrollLeft, top: node.scrollTop }));
        }}
      >
        <div
          className="pdf-page-surface"
          style={{ width: cssWidth, height: cssHeight }}
        >
          <canvas
            className="pdf-canvas"
            ref={canvas}
            aria-label={`Drawing page ${page}`}
            style={{
              position: "absolute",
              left,
              top,
              width: visibleWidth,
              height: visibleHeight,
            }}
          />
        </div>
      </div>
      {document && (
        <p className="tiny" role="status">
          {rendering
            ? "Rendering original PDF detail…"
            : "Original PDF view ready"}{" "}
          · display raster approximately{" "}
          {Math.round(72 * scale * pixels.density)} DPI
        </p>
      )}
      {onDetail && document && (
        <>
          <button
            className="button secondary"
            disabled={detailsDisabled || capturing || rendering || !pageSize}
            onClick={() => void includeDetail()}
          >
            {capturing
              ? "Rendering lossless detail…"
              : "Include this view in analysis (250 DPI)"}
          </button>
          <p className="tiny">
            Zoom into notes or connections first. Detail views are lossless
            additions to the original PDF, not replacements. They cannot restore
            detail missing from an embedded scan.
          </p>
          {detailError && (
            <p className="error" role="alert">
              {detailError}
            </p>
          )}
        </>
      )}
    </div>
  );
}
