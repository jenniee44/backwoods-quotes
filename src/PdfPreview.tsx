import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerURL from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { normalizeRotation, previewRenderSize } from "../shared/pdf";
import type { PdfDetailRegion, PdfRotation } from "../shared/pdf";
import { readableRotation } from "./pdfOrientation";
import { renderPdfDetail } from "./pdfSource";
export default function PdfPreview({
  url,
  onDetail,
  detailsDisabled = false,
  onDetailBusy,
  rotations,
  onRotation,
}: {
  rotations: Record<number, PdfRotation>;
  onRotation: (page: number, rotation: PdfRotation) => void;
  url: string;
  onDetail?: (detail: PdfDetailRegion) => void;
  detailsDisabled?: boolean;
  onDetailBusy?: (busy: boolean) => void;
}) {
  const baseRotations = useRef(
    new WeakMap<PDFDocumentProxy, Map<number, number>>(),
  );
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const rotation = rotations[page] ?? 0;
  const [pageSize, setPageSize] = useState<{
    page: number;
    rotation: PdfRotation;
    viewerRotation: PdfRotation;
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
      .then(async (p) => {
        if (canceled) return;
        let cache = baseRotations.current.get(document);
        if (!cache) {
          cache = new Map();
          baseRotations.current.set(document, cache);
        }
        let base = cache.get(page);
        if (base === undefined) {
          const content = await p.getTextContent().catch(() => ({ items: [] }));
          base = readableRotation(
            p.rotate,
            content.items.flatMap((i) => ("str" in i ? [i] : [])),
          ).rotation;
          cache.set(page, base);
        }
        if (canceled) return;
        const orientation = normalizeRotation(base + rotation);
        const viewport = p.getViewport({ scale: 1, rotation: orientation });
        setPageSize({
          page,
          rotation: orientation,
          viewerRotation: rotation,
          width: viewport.width,
          height: viewport.height,
        });
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
  }, [document, page, rotation]);
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
  const pageReady =
    !!pageSize &&
    pageSize.page === page &&
    pageSize.viewerRotation === rotation;
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
    if (!document || !pageSize || !pageReady) return;
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
      const viewport = p.getViewport({
        scale: scale * pixels.density,
        rotation: pageSize.rotation,
      });
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
    pageReady,
    page,
    scale,
    left,
    top,
    pixels.pixelWidth,
    pixels.pixelHeight,
    pixels.density,
  ]);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const navigation = useRef({ scale: 1, left: 0, top: 0 });
  const anchor = useRef<{
    x: number;
    y: number;
    px: number;
    py: number;
  } | null>(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node && anchor.current) {
      const { x, y, px, py } = anchor.current;
      node.scrollTo(x * scale - px, y * scale - py);
      anchor.current = null;
      setBox((b) => ({ ...b, left: node.scrollLeft, top: node.scrollTop }));
    }
    navigation.current = {
      scale,
      left: node?.scrollLeft ?? left,
      top: node?.scrollTop ?? top,
    };
  }, [scale, left, top, navigationRevision]);
  function changeZoom(
    value: number | null,
    pointer?: { x: number; y: number },
    sourceAnchor?: { x: number; y: number },
  ) {
    const node = scroller.current;
    if (!node || !pageSize || !pageReady || capturing) return;
    const fit = Math.min(1, node.clientWidth / pageSize.width);
    const next =
      value === null ? fit : Math.max(Math.min(0.25, fit), Math.min(4, value));
    const current = anchor.current
      ? navigation.current
      : {
          scale: navigation.current.scale,
          left: node.scrollLeft,
          top: node.scrollTop,
        };
    const px =
      pointer?.x ??
      Math.min(node.clientWidth, pageSize.width * current.scale) / 2;
    const py =
      pointer?.y ??
      Math.min(node.clientHeight, pageSize.height * current.scale) / 2;
    const x = sourceAnchor?.x ?? (current.left + px) / current.scale;
    const y = sourceAnchor?.y ?? (current.top + py) / current.scale;
    anchor.current = { x, y, px, py };
    // Keep consecutive gesture events coherent even before React paints.
    navigation.current = {
      scale: next,
      left: Math.max(
        0,
        Math.min(x * next - px, pageSize.width * next - node.clientWidth),
      ),
      top: Math.max(
        0,
        Math.min(y * next - py, pageSize.height * next - node.clientHeight),
      ),
    };
    setZoom(value === null ? null : next);
    setNavigationRevision((revision) => revision + 1);
  }
  const gestureZoom = useRef(changeZoom);
  useLayoutEffect(() => {
    gestureZoom.current = changeZoom;
  });
  useEffect(() => {
    const node = scroller.current;
    if (!node || !document || !pageReady || capturing) return;
    type GestureEvent = Event & {
      scale: number;
      clientX: number;
      clientY: number;
    };
    let safariScale: number | null = null;
    let touch: {
      distance: number;
      scale: number;
      x: number;
      y: number;
    } | null = null;
    const pointer = (x: number, y: number) => {
      const rect = node.getBoundingClientRect();
      return {
        x: Math.max(
          0,
          Math.min(node.clientWidth, x - rect.left - node.clientLeft),
        ),
        y: Math.max(
          0,
          Math.min(node.clientHeight, y - rect.top - node.clientTop),
        ),
      };
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (safariScale !== null || touch) return;
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? node.clientHeight
            : 1);
      gestureZoom.current(
        navigation.current.scale *
          Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.01),
        pointer(event.clientX, event.clientY),
      );
    };
    const gestureStart = (event: Event) => {
      event.preventDefault();
      safariScale = navigation.current.scale;
    };
    const gestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as GestureEvent;
      if (
        safariScale !== null &&
        !touch &&
        Number.isFinite(gesture.scale) &&
        gesture.scale > 0
      )
        gestureZoom.current(
          safariScale * gesture.scale,
          pointer(gesture.clientX, gesture.clientY),
        );
    };
    const gestureEnd = (event: Event) => {
      event.preventDefault();
      safariScale = null;
    };
    const fingers = (event: TouchEvent) => {
      const [a, b] = [event.touches[0], event.touches[1]];
      return {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        point: pointer(
          (a.clientX + b.clientX) / 2,
          (a.clientY + b.clientY) / 2,
        ),
      };
    };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        touch = null;
        return;
      }
      event.preventDefault();
      const { distance, point } = fingers(event);
      const current = navigation.current;
      touch = {
        distance,
        scale: current.scale,
        x: (current.left + point.x) / current.scale,
        y: (current.top + point.y) / current.scale,
      };
    };
    const touchMove = (event: TouchEvent) => {
      if (!touch || event.touches.length !== 2) return;
      event.preventDefault();
      const { distance, point } = fingers(event);
      if (!touch.distance) return;
      // Restore the initial source anchor, allowing two fingers to pan as well as zoom.
      gestureZoom.current(
        (touch.scale * distance) / touch.distance,
        point,
        touch,
      );
    };
    const touchEnd = () => {
      touch = null;
    };
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("gesturestart", gestureStart, { passive: false });
    node.addEventListener("gesturechange", gestureChange, { passive: false });
    node.addEventListener("gestureend", gestureEnd, { passive: false });
    node.addEventListener("touchstart", touchStart, { passive: false });
    node.addEventListener("touchmove", touchMove, { passive: false });
    node.addEventListener("touchend", touchEnd);
    node.addEventListener("touchcancel", touchEnd);
    return () => {
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("gesturestart", gestureStart);
      node.removeEventListener("gesturechange", gestureChange);
      node.removeEventListener("gestureend", gestureEnd);
      node.removeEventListener("touchstart", touchStart);
      node.removeEventListener("touchmove", touchMove);
      node.removeEventListener("touchend", touchEnd);
      node.removeEventListener("touchcancel", touchEnd);
    };
  }, [document, pageReady, pageSize, capturing]);
  async function includeDetail() {
    if (!document || !pageSize || !pageReady || !onDetail || capturing) return;
    onDetailBusy?.(true);
    setCapturing(true);
    setDetailError("");
    const work = (async () => {
      try {
        const p = await document.getPage(page);
        // Separate high-resolution rendering from original operators, NEVER copy
        // or upscale the preview canvas. Cap size by refusing oversized regions.
        const detail = await renderPdfDetail(
          p,
          {
            x: left / scale,
            y: top / scale,
            width: visibleWidth / scale,
            height: visibleHeight / scale,
          },
          pageSize.rotation,
        );
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
              disabled={page <= 1 || capturing || !pageReady}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} / {document.numPages}
            </span>
            <button
              className="button secondary"
              disabled={page >= document.numPages || capturing || !pageReady}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
          <div className="pdf-zoom-controls">
            <button
              className="button secondary"
              disabled={capturing || rendering || !pageReady}
              onClick={() => onRotation(page, normalizeRotation(rotation - 90))}
            >
              Rotate left
            </button>
            <button
              className="button secondary"
              disabled={capturing || rendering || !pageReady}
              onClick={() => onRotation(page, normalizeRotation(rotation + 90))}
            >
              Rotate right
            </button>
            <span className="tiny" aria-label="Viewer rotation">
              {rotation}°
            </span>
            <label className="field">
              <span>Zoom drawing</span>
              <select
                value={zoom ?? "fit"}
                disabled={capturing || !pageReady}
                onChange={(e) =>
                  changeZoom(
                    e.target.value === "fit" ? null : Number(e.target.value),
                  )
                }
              >
                <option value="fit">Fit sheet</option>
                {zoom !== null && ![0.25, 0.5, 1, 2, 3, 4].includes(zoom) && (
                  <option value={zoom}>{Math.round(zoom * 100)}%</option>
                )}
                {[0.25, 0.5, 1, 2, 3, 4].map((z) => (
                  <option key={z} value={z}>
                    {z * 100}%
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={capturing || !pageReady || scale >= 4}
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
            Pinch or hold Cmd/Ctrl and scroll over the drawing to zoom. Scroll
            to pan; Fit sheet returns to the full width. Zoom to read small
            notes; each view is re-rendered from the original PDF, not enlarged
            preview pixels.
          </p>
        </>
      )}
      <div
        className="pdf-scroll-viewport"
        data-viewer-scale={scale}
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
          {!pageReady
            ? "Preparing original PDF orientation…"
            : rendering
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
            disabled={detailsDisabled || capturing || rendering || !pageReady}
            onClick={() => void includeDetail()}
          >
            {capturing
              ? "Rendering detail…"
              : "Include this view in analysis (250 DPI)"}
          </button>
          <p className="tiny">
            Zoom into notes or connections first. Detail views retain 250 DPI
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
