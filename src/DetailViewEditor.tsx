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
}: {
  source: PlanDocument;
  region: PdfDetailRegion;
  disabled: boolean;
  onBusy: (b: boolean) => void;
  onChange: (r: PdfDetailRegion) => void;
}) {
  const [draft, setDraft] = useState(region),
    [zoom, setZoom] = useState(25),
    [error, setError] = useState(""),
    [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    setDraft(region);
    return () => {
      active.current = false;
    };
  }, [region, source.data]);
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
    <details
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
        {region.x.toFixed(0)}, {region.y.toFixed(0)} ({region.width.toFixed(0)}{" "}
        × {region.height.toFixed(0)} PDF points)
      </summary>
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
      <div className="detail-image-scroll">
        {open && (
          <img
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
  );
}
