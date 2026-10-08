import { useEffect, useRef, useState } from "react";
import type { PlanDocument } from "./model";
import type { PdfDetailRegion } from "../shared/pdf";
import { loadPdfSource, renderPdfDetail } from "./pdfSource";
import NumberInput from "./NumberInput";
export default function DetailViewEditor({
  source,
  region,
  disabled,
  onBusy,
  onChange,
  onPreviewReady,
}: {
  source: PlanDocument;
  region: PdfDetailRegion;
  disabled: boolean;
  onBusy: (b: boolean) => void;
  onChange: (r: PdfDetailRegion) => void;
  onPreviewReady: (ready: boolean) => void;
}) {
  const [draft, setDraft] = useState(region),
    [zoom, setZoom] = useState(25),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useRef(true);
  const inspector = useRef<HTMLDetailsElement>(null);
  const overview = useRef<HTMLCanvasElement>(null);
  const [overviewError, setOverviewError] = useState("");
  const [previewError, setPreviewError] = useState(false);
  useEffect(() => {
    active.current = true;
    setDraft(region);
    return () => {
      active.current = false;
    };
  }, [region, source.data]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let task: Awaited<ReturnType<typeof loadPdfSource>> | undefined;
    setOverviewError("");
    void (async () => {
      try {
        task = await loadPdfSource(source.data);
        const pdf = await task.promise;
        if (cancelled) return;
        const page = await pdf.getPage(region.page);
        const rotation = region.rotation ?? page.rotate;
        const viewport = page.getViewport({ scale: 1, rotation });
        const scale = Math.min(600 / viewport.width, 600 / viewport.height);
        const c = overview.current;
        if (!c || cancelled) return;
        const renderViewport = page.getViewport({ scale, rotation });
        c.width = Math.ceil(renderViewport.width);
        c.height = Math.ceil(renderViewport.height);
        const context = c.getContext("2d");
        if (!context) throw new Error("Page overview unavailable.");
        await page.render({
          canvas: c,
          canvasContext: context,
          viewport: renderViewport,
        }).promise;
      } catch {
        if (!cancelled)
          setOverviewError(
            "Page overview unavailable. Use the original drawing viewer and the source bounds below.",
          );
      } finally {
        await task?.destroy();
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [open, source.data, region.page, region.rotation]);
  async function apply() {
    setRunning(true);
    onBusy(true);
    setError("");
    let task: Awaited<ReturnType<typeof loadPdfSource>> | undefined;
    try {
      task = await loadPdfSource(source.data);
      const pdf = await task.promise;
      const page = await pdf.getPage(region.page);
      const capture = await renderPdfDetail(
        page,
        { x: draft.x, y: draft.y, width: draft.width, height: draft.height },
        region.rotation,
      );
      if (active.current) onChange({ ...capture, label: draft.label });
    } catch (e) {
      if (active.current) setError((e as Error).message);
    } finally {
      await task?.destroy();
      setRunning(false);
      onBusy(false);
    }
  }
  return (
    <section className="detail-view-card">
      <button
        className="detail-thumbnail-button"
        aria-label={`Inspect detail ${region.label || "Manual detail"}, page ${region.page}`}
        onClick={() => {
          if (inspector.current) inspector.current.open = true;
        }}
      >
        <img
          className="detail-thumbnail"
          src={region.data}
          alt={`Detail thumbnail from ${source.name}, page ${region.page}`}
          onLoad={(e) => {
            const ok =
              e.currentTarget.naturalWidth === region.pixelWidth &&
              e.currentTarget.naturalHeight === region.pixelHeight;
            setPreviewError(!ok);
            onPreviewReady(ok);
          }}
          onError={() => {
            setPreviewError(true);
            onPreviewReady(false);
          }}
        />
        <span>Inspect / zoom / adjust</span>
      </button>
      {previewError && (
        <p className="error" role="alert">
          This preview could not be loaded. Regenerate or remove this view
          before analysis.
        </p>
      )}
      <details
        ref={inspector}
        className="detail-inspector"
        onToggle={(e) => {
          const showing = e.currentTarget.open;
          setOpen(showing);
          if (showing)
            document
              .querySelectorAll<HTMLDetailsElement>(".detail-inspector[open]")
              .forEach((node) => {
                if (node !== e.currentTarget) node.open = false;
              });
        }}
      >
        <summary>
          {region.label || "Manual detail"} — Page {region.page} · region{" "}
          {region.x.toFixed(0)}, {region.y.toFixed(0)} (
          {region.width.toFixed(0)} × {region.height.toFixed(0)} PDF points)
        </summary>
        <p>
          <b>Source:</b> {source.name} · Page {region.page} ·{" "}
          {region.rotation ?? 0}°
        </p>
        <p className="tiny">
          Scroll or drag the enlarged image to pan. The highlighted rectangle
          below locates this view on the original sheet.
        </p>
        <div
          className="detail-source-map"
          style={{ aspectRatio: `${region.pageWidth} / ${region.pageHeight}` }}
        >
          <canvas
            ref={overview}
            aria-label={`Original page overview: ${source.name}, page ${region.page}`}
          />
          <svg
            viewBox={`0 0 ${region.pageWidth} ${region.pageHeight}`}
            role="img"
            aria-label="Selected detail region on original PDF"
          >
            <rect
              x={draft.x}
              y={draft.y}
              width={draft.width}
              height={draft.height}
              fill="rgba(230,120,20,.2)"
              stroke="#bd4800"
              strokeWidth={Math.max(region.pageWidth, region.pageHeight) / 150}
            />
          </svg>
        </div>
        {overviewError && <p role="alert">{overviewError}</p>}
        <label className="field">
          <span>Detail name</span>
          <input
            value={region.label ?? ""}
            maxLength={120}
            disabled={disabled || running}
            onChange={(e) => onChange({ ...region, label: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Detail preview zoom (%)</span>
          <input
            type="range"
            min={10}
            max={150}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <div
          className="detail-image-scroll"
          tabIndex={0}
          aria-label="Enlarged detail — scroll or drag to pan"
          onPointerDown={(e) => {
            if (e.pointerType === "touch" || e.button !== 0) return;
            const node = e.currentTarget;
            node.setPointerCapture(e.pointerId);
            node.dataset.dragX = String(e.clientX);
            node.dataset.dragY = String(e.clientY);
          }}
          onPointerMove={(e) => {
            const node = e.currentTarget;
            if (!node.hasPointerCapture(e.pointerId)) return;
            node.scrollLeft -= e.clientX - Number(node.dataset.dragX);
            node.scrollTop -= e.clientY - Number(node.dataset.dragY);
            node.dataset.dragX = String(e.clientX);
            node.dataset.dragY = String(e.clientY);
          }}
          onPointerUp={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          {open && (
            <img
              draggable={false}
              src={region.data}
              alt={`${region.label || "Detail"} from ${source.name}, page ${region.page}`}
              style={{
                width: (region.pixelWidth * zoom) / 100,
                maxWidth: "none",
              }}
            />
          )}
        </div>
        <p className="tiny">
          Adjust the region as a percentage of the sheet, not construction
          measurements. Apply renders again from the original PDF at 250 DPI.{" "}
          {region.rotation ?? 0}° orientation.
        </p>
        <div className="fields compact">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <label className="field" key={key}>
              <span>
                {
                  {
                    x: "Left edge (%)",
                    y: "Top edge (%)",
                    width: "Region width (%)",
                    height: "Region height (%)",
                  }[key]
                }
              </span>
              <NumberInput
                value={
                  (draft[key] /
                    (key === "x" || key === "width"
                      ? region.pageWidth
                      : region.pageHeight)) *
                  100
                }
                disabled={disabled || running}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    [key]:
                      (value / 100) *
                      (key === "x" || key === "width"
                        ? region.pageWidth
                        : region.pageHeight),
                  })
                }
              />
            </label>
          ))}
        </div>
        <button
          className="button secondary"
          disabled={disabled || running}
          onClick={() => void apply()}
        >
          Apply region adjustment
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </details>
    </section>
  );
}
