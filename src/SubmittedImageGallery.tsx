import RotatableSubmittedImage from "./RotatableSubmittedImage";
import { overlap } from "./autoDetailRegions";
import { rotateDetailBounds } from "./pdfOrientation";
import { normalizeRotation, type PdfRotation } from "../shared/pdf";
import { renderPdfDetail } from "./pdfSource";
import { useEffect, useRef, useState } from "react";
import {
  archiveKey,
  readImages,
  retainImages,
  sourceHash,
  type ImageArchive,
} from "./analysisImageArchive";
import { loadPdfSource } from "./pdfSource";
import DetailViewEditor from "./DetailViewEditor";
import type { PlanDocument } from "./model";
import type { PreparedDetail } from "./detailReadability";
function SourceMap({
  source,
  region,
}: {
  source: PlanDocument;
  region: PreparedDetail;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    let task: Awaited<ReturnType<typeof loadPdfSource>> | undefined;
    void (async () => {
      try {
        task = await loadPdfSource(source.data);
        const pdf = await task.promise;
        const page = await pdf.getPage(region.page);
        const view = page.getViewport({
          scale: 1,
          rotation: region.rotation ?? 0,
        });
        const viewport = page.getViewport({
          scale: Math.min(600 / view.width, 600 / view.height),
          rotation: region.rotation ?? 0,
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
        }).promise;
        if (!cancelled) setUrl(canvas.toDataURL());
        canvas.width = canvas.height = 0;
      } catch {
        if (!cancelled) setUrl("");
      } finally {
        await task?.destroy();
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [source.data, region.page, region.rotation]);
  return url ? (
    <div className="submitted-source-map">
      <img src={url} alt={`Original ${source.name}, page ${region.page}`} />
      <span
        aria-label="Submitted crop location on original page"
        style={{
          left: `${(region.x / region.pageWidth) * 100}%`,
          top: `${(region.y / region.pageHeight) * 100}%`,
          width: `${(region.width / region.pageWidth) * 100}%`,
          height: `${(region.height / region.pageHeight) * 100}%`,
        }}
      />
    </div>
  ) : (
    <p className="tiny">
      Source overview unavailable; source page and crop coordinates remain
      recorded.
    </p>
  );
}
export default function SubmittedImageGallery({
  quoteId,
  reportId,
  count,
  message,
  documents,
  locked,
  onSupplement,
}: {
  quoteId: string;
  reportId: string;
  count: number;
  message?: string;
  documents: PlanDocument[];
  locked: boolean;
  onSupplement: (
    documentId: string,
    r: PreparedDetail,
    companions: PreparedDetail[],
  ) => void;
}) {
  const [replace, setReplace] = useState(true);
  const [inspectionTurn, setInspectionTurn] = useState<PdfRotation>(0),
    [preparing, setPreparing] = useState(false),
    [prepareMessage, setPrepareMessage] = useState("");
  const operation = useRef(0);
  const [open, setOpen] = useState(false),
    [archive, setArchive] = useState<ImageArchive>(),
    [loaded, setLoaded] = useState(false),
    [active, setActive] = useState<number | null>(null),
    [zoom, setZoom] = useState(100),
    [correct, setCorrect] = useState(false),
    [source, setSource] = useState<PlanDocument>(),
    [flagMessage, setFlagMessage] = useState("");
  useEffect(() => {
    if (!open || count === 0) return;
    let cancelled = false;
    void readImages(archiveKey(quoteId, reportId)).then((a) => {
      if (!cancelled) {
        setArchive(a);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, quoteId, reportId, count]);
  const image = active === null ? undefined : archive?.images[active];
  useEffect(() => {
    let cancelled = false;
    operation.current++;
    setSource(undefined);
    setCorrect(false);
    if (!image) return;
    const d = documents.find((d) => d.id === image.documentId);
    if (d)
      void sourceHash(d.data).then((hash) => {
        if (!cancelled && hash === image.sourceHash) setSource(d);
      });
    return () => {
      cancelled = true;
      operation.current++;
    };
  }, [image, documents]);
  async function prepareRotation() {
    if (!image || !source || !archive || !inspectionTurn || locked || preparing)
      return;
    const token = ++operation.current;
    setPreparing(true);
    setPrepareMessage("");
    let task: Awaited<ReturnType<typeof loadPdfSource>> | undefined;
    try {
      let candidate = image.region;
      for (let step = 0; step < inspectionTurn / 90; step++)
        candidate = rotateDetailBounds(candidate, 90);
      task = await loadPdfSource(source.data);
      const pdf = await task.promise;
      const page = await pdf.getPage(candidate.page);
      const capture = await renderPdfDetail(
        page,
        candidate,
        candidate.rotation,
      );
      if (token === operation.current) {
        onSupplement(
          source.id,
          {
            ...capture,
            label: image.region.label,
            orientationUncertain: false,
            cropNeedsReview: false,
            inspectionNote:
              "Manually rotated replacement from the original PDF. Inspect before a future analysis; no construction quantity is verified.",
          },
          archive.images
            .filter(
              (i) =>
                i.documentId === source.id &&
                i.sourceHash === image.sourceHash &&
                i !== image,
            )
            .map((i) => i.region),
        );
        setPrepareMessage(
          "Rotated replacement prepared for a future analysis. Historical submitted pixels are unchanged. Inspect the prepared package and explicitly Analyze Plans when ready.",
        );
      }
    } catch (e) {
      if (token === operation.current) setPrepareMessage((e as Error).message);
    } finally {
      await task?.destroy();
      setPreparing(false);
    }
  }
  const related = image
    ? (archive?.images ?? []).flatMap((other, index) =>
        other !== image &&
        other.documentId === image.documentId &&
        other.region.page === image.region.page &&
        overlap(
          { ...other.region, label: "", score: 0 },
          { ...image.region, label: "", score: 0 },
        ) > 0.02
          ? [index]
          : [],
      )
    : [];
  async function flag(index: number) {
    if (!archive) return;
    const next = {
      ...archive,
      images: archive.images.map((i, n) =>
        n === index ? { ...i, flagged: !i.flagged } : i,
      ),
    };
    setArchive(next);
    setFlagMessage(
      (await retainImages(next))
        ? "Review flag saved privately."
        : "Review flag is available for this session only; private storage unavailable.",
    );
  }
  const uncertain =
    archive?.images.filter(
      (i) => i.region.orientationUncertain || i.region.cropNeedsReview,
    ).length ?? 0;
  return (
    <section className="submitted-image-gallery">
      <button
        className="button secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        View AI Detail Images ({count})
      </button>
      {!open && message?.includes("session only") && (
        <p className="tiny" role="status">
          {message}
        </p>
      )}
      {open && count === 0 && (
        <p>
          No detail images were submitted. This analysis used the original
          document(s).
        </p>
      )}
      {open && count > 0 && (
        <div>
          <p className="tiny">
            Exact images submitted for this analysis. Viewing and zooming do not
            call AI. {message}
          </p>
          {loaded && !archive && (
            <p role="status">
              Submitted images are no longer available on this device. They
              cannot be recreated as an exact submission. A future analysis can
              prepare a new set.
            </p>
          )}
          {!!uncertain && (
            <details className="analysis-report">
              <summary>
                {uncertain} image(s) need orientation or crop inspection
              </summary>
              <p>
                These are reading aids, not verified construction facts. Check
                small text, cut-off linework and orientation in the images
                below.
              </p>
            </details>
          )}
          {archive && (
            <>
              <div className="submitted-image-grid">
                {archive.images.map((i, n) => (
                  <article key={n}>
                    <button
                      className="detail-thumbnail-button"
                      onClick={() => {
                        setActive(n);
                        setZoom(100);
                        setInspectionTurn(0);
                        setPrepareMessage("");
                      }}
                      aria-label={`Inspect submitted image ${n + 1}`}
                    >
                      <img
                        className="detail-thumbnail"
                        src={i.region.data}
                        alt={`Submitted image ${n + 1}: ${i.documentName}, page ${i.region.page}`}
                      />
                      <span>
                        Image {n + 1} · {i.documentName} · Page {i.region.page}{" "}
                        · Source detail {i.sourceDetailView ?? n + 1}
                      </span>
                      <span>
                        {i.region.rotation ?? 0}° · {i.region.dpi} DPI
                        {i.region.orientationUncertain ||
                        i.region.cropNeedsReview
                          ? " · Needs inspection"
                          : " · Inspect legibility"}
                      </span>
                    </button>
                    <label className="check-options">
                      <input
                        type="checkbox"
                        checked={!!i.flagged}
                        onChange={() => void flag(n)}
                      />
                      Flag incorrect / unreadable image {n + 1}
                    </label>
                  </article>
                ))}
              </div>
              {flagMessage && <p role="status">{flagMessage}</p>}
              {image && (
                <section
                  className="submitted-inspector"
                  aria-label="Submitted image inspection"
                >
                  <h4>
                    Image {active! + 1} —{" "}
                    {image.region.label || "Drawing detail"}
                  </h4>
                  <p>
                    {image.documentName} · Page {image.region.page} ·{" "}
                    {image.region.rotation ?? 0}° absolute orientation
                    {image.region.sourcePageRotation !== undefined
                      ? ` (original PDF rotation ${image.region.sourcePageRotation}°)`
                      : ""}
                  </p>
                  <div className="heading-actions">
                    <button onClick={() => setZoom(Math.max(25, zoom - 25))}>
                      Zoom out submitted image
                    </button>
                    <output>{zoom}%</output>
                    <button onClick={() => setZoom(Math.min(400, zoom + 25))}>
                      Zoom in submitted image
                    </button>
                    <button
                      onClick={() =>
                        setInspectionTurn(
                          normalizeRotation(inspectionTurn - 90),
                        )
                      }
                    >
                      Rotate inspection left
                    </button>
                    <button
                      onClick={() =>
                        setInspectionTurn(
                          normalizeRotation(inspectionTurn + 90),
                        )
                      }
                    >
                      Rotate inspection right
                    </button>
                    <button
                      disabled={
                        locked || preparing || !source || inspectionTurn === 0
                      }
                      onClick={() => void prepareRotation()}
                    >
                      Prepare rotated replacement for next analysis
                    </button>
                    <button onClick={() => setActive(null)}>Close image</button>
                  </div>
                  <p className="tiny" role="status">
                    Inspection rotation: {inspectionTurn}°. Submitted
                    orientation remains {image.region.rotation ?? 0}°.
                    Inspection controls do not change the historical image or
                    call AI.
                  </p>
                  <RotatableSubmittedImage
                    data={image.region.data}
                    pixelWidth={image.region.pixelWidth}
                    pixelHeight={image.region.pixelHeight}
                    zoom={zoom}
                    turn={inspectionTurn}
                  />
                  {prepareMessage && <p role="status">{prepareMessage}</p>}
                  {!!related.length && (
                    <details className="analysis-report">
                      <summary>Related source views ({related.length})</summary>
                      <p>
                        These images overlap the same original page. They are
                        additional observations, not additional material counts.
                        Different assemblies still need separate evidence.
                      </p>
                      {related.map((index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setActive(index);
                            setInspectionTurn(0);
                            setZoom(100);
                          }}
                        >
                          Inspect related image {index + 1}
                        </button>
                      ))}
                    </details>
                  )}
                  <p className="tiny">
                    {image.region.inspectionNote ||
                      "Inspect dimensions and notes; readable pixels alone do not verify construction scope or quantities."}{" "}
                    · Crop: {Math.round(image.region.x)},{" "}
                    {Math.round(image.region.y)},{" "}
                    {Math.round(image.region.width)} ×{" "}
                    {Math.round(image.region.height)} PDF points.
                  </p>
                  {source ? (
                    <>
                      <SourceMap source={source} region={image.region} />
                      <button
                        className="button secondary"
                        disabled={locked}
                        onClick={() => setCorrect(!correct)}
                      >
                        Prepare corrected / additional view for future analysis
                      </button>
                      {correct && (
                        <>
                          <p>
                            The submitted image stays unchanged. Adjust or
                            rotate a new manual view below, then explicitly
                            analyze again. Nothing is automatically approved.
                          </p>
                          <label className="check-options">
                            <input
                              type="checkbox"
                              checked={replace}
                              onChange={(e) => setReplace(e.target.checked)}
                            />
                            Replace this image for the next analysis (keep other
                            saved views). Uncheck to add a supplementary view.
                          </label>
                          <DetailViewEditor
                            source={source}
                            region={image.region}
                            disabled={locked}
                            onBusy={() => {}}
                            onPreviewReady={() => {}}
                            onChange={(r) =>
                              onSupplement(
                                source.id,
                                r,
                                archive.images
                                  .filter(
                                    (i) =>
                                      i.documentId === source.id &&
                                      i.sourceHash === image.sourceHash &&
                                      (!replace || i !== image),
                                  )
                                  .map((i) => i.region),
                              )
                            }
                          />
                        </>
                      )}
                    </>
                  ) : (
                    <p className="tiny">
                      Original source is unavailable or has changed. The
                      submitted image remains inspectable; attach the matching
                      original before preparing a correction.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
