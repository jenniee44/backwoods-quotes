import type { PreparedDetail } from "./detailReadability";
import { assertDetailInclusion } from "./detailPackage";
import { analysisBatches, analyzeBatches } from "./analysisBatches";
import AutoDetailSelection from "./AutoDetailSelection";
import DetailViewEditor from "./DetailViewEditor";
import TakeoffTable from "./TakeoffTable";
import { assertScope } from "./takeoffScope";
import { consolidateTakeoff } from "./consolidateTakeoff";
import { optimizeAnalysisPackage } from "./optimizeAnalysisPackage";
import {
  analysisPackageSize,
  packageProblem,
  dataBytes,
} from "../shared/analysisPackage";
import type { AnalysisDocument } from "../shared/analysis";
import { preparePlanAnalysis } from "./preparePlanAnalysis";
import { maxDetailRegions } from "../shared/pdf";
import type { PdfDetailRegion, PdfRotation } from "../shared/pdf";
import {
  planAnalysisService,
  documentFingerprint,
  addAnalysisSuggestions,
  editTakeoff,
  approveTakeoffBatch,
} from "./planAnalysis";
import { validatePlanFile } from "./validatePlanFile";
import PdfPreview from "./PdfPreview";
import { useEffect, useState, useRef, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { id } from "./model";
import type { Quote, PlanDocument, TakeoffItem } from "./model";
function DocumentPreview({
  document: d,
  onDetail,
  detailsDisabled,
  onDetailBusy,
  rotations,
  onRotation,
}: {
  rotations: Record<number, PdfRotation>;
  onRotation: (page: number, rotation: PdfRotation) => void;
  document: PlanDocument;
  onDetail: (region: PdfDetailRegion) => void;
  detailsDisabled: boolean;
  onDetailBusy: (busy: boolean) => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const base64 = d.data.split(",")[1];
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const next = URL.createObjectURL(new Blob([bytes], { type: d.type }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [d]);
  return (
    <>
      <a href={url} download={d.name} className="back">
        Download {d.name}
      </a>
      {d.type === "application/pdf" ? (
        <PdfPreview
          url={url}
          rotations={rotations}
          onRotation={onRotation}
          onDetail={onDetail}
          detailsDisabled={detailsDisabled}
          onDetailBusy={onDetailBusy}
        />
      ) : (
        <img className="plan-preview" src={url} alt={d.name} />
      )}
    </>
  );
}
export type PdfOrientations = Record<
  string,
  { source: string; pages: Record<number, PdfRotation> }
>;
export default function PlansTakeoff({
  orientations,
  setOrientations,
  quote: q,
  locked,
  onChange,
  onError,
  onViewEstimate,
}: {
  orientations: PdfOrientations;
  setOrientations: React.Dispatch<React.SetStateAction<PdfOrientations>>;
  quote: Quote;
  locked: boolean;
  onChange: (q: Quote) => void;
  onError: (s: string) => void;
  onViewEstimate?: () => void;
}) {
  const [excludedDocuments, setExcludedDocuments] = useState<string[]>([]);
  // Temporary full-resolution detail views. Bound to exact source bytes; not saved in
  // customer records, persisted attachments, or reused after PDF replacement.
  const [detailViews, setDetailViews] = useState<
    {
      id: string;
      documentId: string;
      originalData: string;
      region: PreparedDetail;
      automatic?: boolean;
    }[]
  >([]);
  const validDetails = useMemo(
    () =>
      detailViews.filter((view) =>
        q.documents.some(
          (d) => d.id === view.documentId && d.data === view.originalData,
        ),
      ),
    [detailViews, q.documents],
  );
  const [detailGroup, setDetailGroup] = useState("All details");
  const detailGroups = [
    ...new Set(
      validDetails.map((v) => v.region.reviewGroup || "Manual details"),
    ),
  ];
  const [excludedDetails, setExcludedDetails] = useState<string[]>([]);
  const [originalOnlyConfirmed, setOriginalOnlyConfirmed] = useState(false);
  const selectedDetails = validDetails.filter(
    (v) =>
      !excludedDocuments.includes(v.documentId) &&
      !excludedDetails.includes(v.id),
  );
  const emptyDetailPackage =
    validDetails.length > 0 &&
    selectedDetails.length === 0 &&
    !originalOnlyConfirmed;
  const [previewReady, setPreviewReady] = useState<Record<string, string>>({});
  const allPreviewsReady = validDetails
    .filter(
      (v) =>
        v.automatic &&
        !excludedDocuments.includes(v.documentId) &&
        !excludedDetails.includes(v.id),
    )
    .every((v) => previewReady[v.id] === v.region.data);
  const [detailsInspected, setDetailsInspected] = useState(false);
  const selectedDocuments = useMemo(
    () =>
      q.documents
        .filter((d) => !excludedDocuments.includes(d.id))
        .map((d) => ({
          ...d,
          ...(validDetails.some(
            (v) => v.documentId === d.id && !excludedDetails.includes(v.id),
          )
            ? {
                detailRegions: validDetails
                  .filter(
                    (v) =>
                      v.documentId === d.id && !excludedDetails.includes(v.id),
                  )
                  .map((v) => v.region),
              }
            : {}),
        })),
    [q.documents, excludedDocuments, validDetails, excludedDetails],
  );
  const [analysisPackage, setAnalysisPackage] = useState<{
    sources: AnalysisDocument[];
    documents: AnalysisDocument[];
    error: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void optimizeAnalysisPackage(selectedDocuments, controller.signal)
      .then((documents) => {
        assertDetailInclusion(selectedDocuments, documents);
        if (documents.length) analysisBatches(documents);
        if (!controller.signal.aborted)
          setAnalysisPackage({
            sources: selectedDocuments,
            documents,
            error: "",
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setAnalysisPackage({
            sources: selectedDocuments,
            documents: selectedDocuments,
            error:
              packageProblem(selectedDocuments) || (error as Error).message,
          });
      });
    return () => controller.abort();
  }, [selectedDocuments]);
  const packageReady = analysisPackage?.sources === selectedDocuments;
  const packageSize = analysisPackageSize(
    packageReady ? analysisPackage.documents : selectedDocuments,
  );
  const capturedSize = analysisPackageSize(selectedDocuments);
  const latest = useRef(q);
  latest.current = q;
  const request = useRef<AbortController | null>(null);
  const [analysisState, setAnalysisState] = useState("Ready to analyze");
  const [analysisError, setAnalysisError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [inputNotes, setInputNotes] = useState<string[]>([]);
  const [detailRendering, setDetailRendering] = useState(false);
  const [automaticRendering, setAutomaticRendering] = useState(false);
  const detailProcessing = detailRendering || automaticRendering;
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const busy =
    analysisState === "Uploading/preparing" ||
    analysisState === "Analyzing plans";
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );
  async function analyze() {
    if (
      (validDetails.some(
        (v) =>
          v.automatic &&
          !excludedDocuments.includes(v.documentId) &&
          !excludedDetails.includes(v.id),
      ) &&
        (!detailsInspected || !allPreviewsReady)) ||
      emptyDetailPackage ||
      request.current ||
      locked ||
      detailProcessing ||
      !packageReady ||
      analysisPackage.error
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setAnalysisError("");
    setReviewError("");
    setInputNotes([]);
    setAnalysisState("Uploading/preparing");
    try {
      const documents = structuredClone(analysisPackage.documents);
      assertDetailInclusion(selectedDocuments, documents);
      analysisBatches(documents);
      const fingerprint = await documentFingerprint(documents);
      if (
        latest.current.analysisReports?.some(
          (report) => report.fingerprint === fingerprint,
        )
      )
        throw new Error(
          "These plans have already been analyzed. Review the existing proposed items.",
        );
      const originalText = await preparePlanAnalysis(
        documents.map((d) => {
          const copy = { ...d };
          delete copy.detailRegions;
          return copy;
        }),
        controller.signal,
      );
      const prepared = originalText.map((d) => ({
        ...d,
        ...(documents.find((s) => s.id === d.id)?.detailRegions
          ? {
              detailRegions: documents.find((s) => s.id === d.id)!
                .detailRegions,
            }
          : {}),
      }));
      assertDetailInclusion(documents, prepared);
      controller.signal.throwIfAborted();
      setInputNotes(
        prepared
          .filter((d) => d.type === "application/pdf")
          .flatMap((d) => {
            const layer = d.pdfText;
            const notes = [
              `${d.name}: unchanged original PDF + selectable text from ${layer?.pages.filter((p) => p.text).length ?? 0} page(s) + ${d.detailRegions?.length ?? 0} full-resolution detail view(s).`,
            ];
            if (layer?.truncated)
              notes.push(
                `${d.name}: supplemental text was truncated at the request limit. Full original PDF is still sent; select fewer files or targeted detail views for missing notes.`,
              );
            for (const p of layer?.pages ?? [])
              if (
                p.status === "No selectable text" ||
                p.status === "Unavailable"
              )
                notes.push(
                  `${d.name}, page ${p.page}: ${p.status === "Unavailable" ? "selectable text extraction unavailable" : "no selectable text layer"}. Original PDF visuals remain available; no OCR guesses added.`,
                );
            return notes;
          }),
      );
      setAnalysisState("Analyzing plans");
      let submittedDetails = 0;
      const result = await analyzeBatches(
        prepared,
        controller.signal,
        async (docs, signal) => {
          const result = await planAnalysisService.analyze(docs, signal);
          submittedDetails += analysisPackageSize(docs).detailCount;
          setInputNotes((notes) => [
            ...notes.filter((n) => !n.startsWith("Submitted detail views:")),
            `Submitted detail views: ${submittedDetails} of ${analysisPackageSize(prepared).detailCount}. Original files included in every request.`,
          ]);
          return result;
        },
        (number, total) =>
          setInputNotes((notes) => [
            ...notes.filter((n) => !n.startsWith("Analyzing batch")),
            `Analyzing batch ${number} of ${total}. Original PDFs accompany every batch; nothing is added until all succeed.`,
          ]),
      );
      if (controller.signal.aborted) return;
      if (
        (await documentFingerprint(
          latest.current.documents
            .filter((d) => documents.some((source) => source.id === d.id))
            .map((d) => ({
              ...d,
              ...(documents.find((source) => source.id === d.id)?.detailRegions
                ? {
                    detailRegions: documents.find(
                      (source) => source.id === d.id,
                    )!.detailRegions,
                  }
                : {}),
            })),
        )) !== fingerprint
      )
        throw new Error(
          "Source files changed during analysis. Results were not added; analyze the current files.",
        );
      onChange(
        addAnalysisSuggestions(
          latest.current,
          result,
          fingerprint,
          selectedDocuments,
        ),
      );
      setAnalysisState(
        result.suggestions.length || result.dimensions?.length
          ? "Analysis complete — needs review"
          : "Analysis complete — no usable takeoff found",
      );
    } catch (error) {
      if (request.current === controller) {
        setAnalysisState("Analysis failed");
        setAnalysisError(
          controller.signal.aborted
            ? "Analysis cancelled. Existing estimates are unchanged."
            : (error as Error).message,
        );
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }
  function updateItem(
    item: TakeoffItem,
    action: (item: TakeoffItem) => TakeoffItem,
  ) {
    try {
      const next = action(item);
      if (next.status === "Approved") assertScope(q, next);
      setReviewError("");
      onChange({
        ...q,
        takeoff: q.takeoff.map((t) => (t.id === item.id ? next : t)),
      });
    } catch (error) {
      setReviewError((error as Error).message);
    }
  }
  function bulkApprove(reviewedOnly = false) {
    const chosen = q.takeoff.filter(
      (t) =>
        !t.convertedLineId &&
        (reviewedOnly ? t.status === "Reviewed" : selectedItems.includes(t.id)),
    );
    try {
      const next = approveTakeoffBatch(q, chosen);
      setReviewError("");
      onChange(next);
      setSelectedItems([]);
    } catch (error) {
      setReviewError((error as Error).message);
    }
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const current = q.documents.find((d) => d.id === selected);
  async function attach(files: FileList | null, replaceId?: string) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      if (!replaceId && q.documents.length + files.length > 8)
        throw new Error("Attach up to 8 documents per quote.");
      const added = await Promise.all(
        Array.from(files).map(async (f) => {
          if (
            ![
              "application/pdf",
              "image/jpeg",
              "image/png",
              "image/webp",
            ].includes(f.type) ||
            f.size > 2000000
          )
            throw new Error(
              "Use PDF, JPEG, PNG or WebP files up to 2 MB each. Browser storage is limited; compress larger drawings.",
            );
          if (
            f.type === "application/pdf" &&
            new TextDecoder().decode(await f.slice(0, 5).arrayBuffer()) !==
              "%PDF-"
          )
            throw new Error("This file is not a valid PDF.");
          const data = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error("Unable to read document."));
            r.readAsDataURL(f);
          });
          const document = {
            id: replaceId ?? id(),
            name: f.name,
            type: f.type,
            data,
            addedAt: new Date().toISOString(),
          } as PlanDocument;
          await validatePlanFile(document);
          return document;
        }),
      );
      onChange({
        ...q,
        documents: replaceId
          ? q.documents.map((d) => (d.id === replaceId ? added[0] : d))
          : [...q.documents, ...added],
        takeoff: replaceId
          ? q.takeoff.map((t) =>
              t.documentId === replaceId
                ? {
                    ...t,
                    status: "Proposed",
                    confidence: "Unspecified",
                    reviewAcknowledged: false,
                    scopeVerified: false,
                    sourceDetailView: null,
                  }
                : t,
            )
          : q.takeoff,
      });
      setSelected(added[0].id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function patch(item: TakeoffItem, delta: Partial<TakeoffItem>) {
    if (delta.documentId !== undefined)
      delta = {
        ...delta,
        sourceDocumentName: q.documents.find((d) => d.id === delta.documentId)
          ?.name,
        sourceDetailView: null,
      };
    if (delta.page !== undefined) delta = { ...delta, sourceDetailView: null };
    setReviewError("");
    onChange({
      ...q,
      takeoff: q.takeoff.map((t) =>
        t.id === item.id ? editTakeoff(t, delta) : t,
      ),
    });
  }
  return (
    <>
      <div className="info">
        <b>
          1 Upload → 2 Analyze → 3 Review → 4 Approve → 5 Convert to Estimate
        </b>
        <p>
          AI-assisted takeoff for estimating purposes only. Verify dimensions,
          quantities, specifications and site conditions before quoting or
          construction.
        </p>
        <p>
          Analysis sends the attached files to the server and OpenAI. Plans may
          contain personal information; redact anything unnecessary first.
          Extracted results stay private to your estimate.
        </p>
      </div>
      {validDetails.some((v) => v.automatic) && !detailsInspected && (
        <p className="info">
          Inspect the generated images below, then confirm the detail-view
          review before analysis.
        </p>
      )}
      {packageReady &&
        !analysisPackage.error &&
        packageSize.total > 8_000_000 && (
          <p className="info">
            This package will use{" "}
            {analysisBatches(analysisPackage.documents).length} bounded
            requests. Every request includes all selected originals. This
            increases AI cost and uses the existing rate limit; a failure or
            cancellation adds no partial takeoff.
          </p>
        )}
      <div className="heading-actions">
        <button
          className="button"
          disabled={
            (validDetails.some(
              (v) =>
                v.automatic &&
                !excludedDocuments.includes(v.documentId) &&
                !excludedDetails.includes(v.id),
            ) &&
              (!detailsInspected || !allPreviewsReady)) ||
            emptyDetailPackage ||
            locked ||
            busy ||
            detailProcessing ||
            uploading ||
            !packageReady ||
            !!analysisPackage?.error ||
            !q.documents.some((d) => !excludedDocuments.includes(d.id))
          }
          onClick={analyze}
        >
          Analyze Plans
        </button>
        {busy && (
          <button
            className="button secondary"
            onClick={() => request.current?.abort()}
          >
            Cancel analysis
          </button>
        )}
        {q.takeoff.some((t) => t.convertedLineId) && (
          <button className="button secondary" onClick={onViewEstimate}>
            View Estimate
          </button>
        )}
      </div>
      <div
        className="analysis-package"
        aria-label="Analysis package"
        aria-live="polite"
      >
        <b>Analysis package</b>
        <p>
          <strong>
            {selectedDetails.length} detail views selected for analysis
          </strong>{" "}
          · {validDetails.length} available previews ·{" "}
          {packageReady
            ? `${packageSize.detailCount} prepared for submission`
            : "preparing…"}
        </p>
        {emptyDetailPackage && (
          <div role="alert" className="error">
            No detail views will be sent, although previews exist. Their source
            files or views are excluded. Restore selection before analysis, or
            explicitly choose original-only analysis.
            <button
              className="button secondary"
              onClick={() => {
                setExcludedDetails([]);
                setExcludedDocuments((ids) =>
                  ids.filter(
                    (id) => !validDetails.some((v) => v.documentId === id),
                  ),
                );
                setDetailsInspected(false);
              }}
            >
              Restore detail selection
            </button>
            <button
              className="button secondary"
              onClick={() => setOriginalOnlyConfirmed(true)}
            >
              Use selected originals only
            </button>
          </div>
        )}
        {originalOnlyConfirmed && selectedDetails.length === 0 && (
          <p>
            Original-only analysis explicitly selected. No detail images will be
            submitted.
          </p>
        )}
        <p className="tiny">
          Original files: {(packageSize.originals / 1_000_000).toFixed(2)} MB ·
          Detail views: {(packageSize.details / 1_000_000).toFixed(2)} MB (
          {packageSize.detailCount}) · Estimated total:{" "}
          {(packageSize.total / 1_000_000).toFixed(2)} MB / 8 MB
        </p>
        <p className="tiny">
          {!packageReady
            ? "Preparing high-quality detail optimization…"
            : capturedSize.details > packageSize.details
              ? `Detail encoding optimized from ${(capturedSize.details / 1_000_000).toFixed(2)} MB to ${(packageSize.details / 1_000_000).toFixed(2)} MB. PNG or high-quality JPEG; all 250 DPI pixels and selected views retained.`
              : "Original files unchanged. PNG is kept when compact; larger details use high-quality JPEG at the same 250 DPI pixel dimensions. No automatic view removal."}
        </p>
        {packageReady && packageSize.detailCount > 0 && (
          <details className="tiny">
            <summary>Detail encoding and size</summary>
            <ul>
              {analysisPackage.documents.flatMap((d) =>
                (d.detailRegions ?? []).map((region, index) => (
                  <li key={`${d.id}-${index}`}>
                    {d.name} · Page {region.page} · Detail {index + 1} ·{" "}
                    {region.encoding === "JPEG"
                      ? `JPEG ${Math.round((region.quality ?? 0.96) * 100)}%`
                      : "Lossless PNG"}{" "}
                    · {(dataBytes(region.data) / 1_000_000).toFixed(2)} MB
                  </li>
                )),
              )}
            </ul>
            JPEG encoding can introduce artifacts; verify small notes and use
            Contractor Input Required for unreadable information. Pixels are not
            resized.
          </details>
        )}
        {packageReady && analysisPackage.error && (
          <p className="error" role="alert">
            {analysisPackage.error} Analysis is blocked before any API request.
            <button
              className="button secondary"
              disabled={busy || detailProcessing}
              onClick={() => setExcludedDetails((ids) => [...ids])}
            >
              Rebuild analysis package
            </button>
            Selected sources: {selectedDocuments.map((d) => d.name).join(", ")}.
            Selected details:{" "}
            {selectedDocuments
              .flatMap((d) =>
                (d.detailRegions ?? []).map(
                  (r, i) => `${d.name}, page ${r.page}, detail ${i + 1}`,
                ),
              )
              .join("; ") || "none"}
            .
          </p>
        )}
      </div>
      <p role="status" aria-live="polite">
        {uploading ? "Uploading/preparing" : analysisState}
      </p>
      {busy && <progress aria-label="Plan analysis progress" />}
      {inputNotes
        .filter((n) => n.startsWith("Submitted detail views:"))
        .map((n) => (
          <p role="status" key={n}>
            Last analysis run: {n}
          </p>
        ))}
      {!!inputNotes.length && (
        <details className="analysis-report">
          <summary>Analysis source quality</summary>
          <ul>
            {inputNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </details>
      )}
      {analysisError && (
        <p className="error" role="alert">
          {analysisError}
        </p>
      )}
      {(q.analysisReports ?? []).map((report) => (
        <details key={report.id} className="analysis-report" open>
          <summary>
            Plan summary · {new Date(report.createdAt).toLocaleDateString()}
          </summary>
          {report.project && (
            <>
              <p>
                <b>
                  {report.project.projectType} · {report.project.drawingTitle}
                </b>
              </p>
              <p>{report.project.description}</p>
              <p className="tiny">
                Drawing sheets analyzed:{" "}
                {report.project.drawingNumbers.join(", ") ||
                  "Sheet labels not readable"}
              </p>
              {!!report.sourceDocuments?.length && (
                <p className="tiny">
                  Sources:{" "}
                  {report.sourceDocuments.map((d) => d.name).join(", ")}
                </p>
              )}
            </>
          )}
          {report.summary && (
            <div className="plan-summary-grid">
              {(
                [
                  ["Major scope detected", report.summary.majorScope],
                  [
                    "Key readable specifications",
                    report.summary.readableSpecifications,
                  ],
                  ["Major unknowns", report.summary.majorUnknowns],
                  ["Site verification", report.summary.siteVerification],
                ] as const
              )
                .filter(([, values]) => values.length)
                .map(([label, values]) => (
                  <section key={label}>
                    <h3>{label}</h3>
                    <ul>
                      {values.slice(0, 6).map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                    {values.length > 6 && (
                      <details>
                        <summary>{values.length - 6} more</summary>
                        <ul>
                          {values.slice(6).map((text, i) => (
                            <li key={i}>{text}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </section>
                ))}
            </div>
          )}
          {!!report.duplicatesReduced && (
            <p className="tiny">
              {report.duplicatesReduced} overlapping suggestion(s) combined or
              skipped. Existing reviewed/converted items were preserved.
            </p>
          )}
          {(!!report.summary?.observations.length ||
            !!report.sourceObservations?.length) && (
            <details className="source-observations">
              <summary>Source observations (not estimate lines)</summary>
              <ul>
                {report.sourceObservations?.map((observation, i) => (
                  <li key={`source-${i}`}>
                    <b>{observation.description}</b>:{" "}
                    {observation.quantity ?? "Quantity not established"}{" "}
                    {observation.unit}
                    {observation.specification && (
                      <p>{observation.specification}</p>
                    )}
                    <p className="tiny">
                      {observation.classification} · {observation.confidence}{" "}
                      source confidence ·{" "}
                      {report.sourceDocuments?.find(
                        (d) => d.id === observation.documentId,
                      )?.name ??
                        q.documents.find((d) => d.id === observation.documentId)
                          ?.name ??
                        "Removed source"}
                      {observation.page ? ` — Page ${observation.page}` : ""}
                      {observation.sourceDetailView
                        ? ` · Detail view ${observation.sourceDetailView}`
                        : ""}
                      {observation.supportBasis &&
                      observation.supportBasis !== "Not established"
                        ? ` · ${observation.supportBasis}`
                        : ""}
                    </p>
                    {!!observation.sourceFacts?.length && (
                      <p className="tiny">
                        {observation.sourceFacts.join("; ")}
                      </p>
                    )}
                    {observation.calculationBasis && (
                      <p className="tiny">{observation.calculationBasis}</p>
                    )}
                  </li>
                ))}
                {report.summary?.observations.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </details>
          )}
          {!!report.dimensions?.length && (
            <>
              <h3>Key dimensions (information only)</h3>
              {report.dimensions.map((dimension, i) => (
                <p key={i}>
                  <b>{dimension.description}</b>:{" "}
                  {dimension.quantity ?? "Requires contractor input"}{" "}
                  {dimension.unit} · {dimension.confidence} confidence ·{" "}
                  {q.documents.find((d) => d.id === dimension.documentId)
                    ?.name ?? "Removed source"}
                  {dimension.page ? ` — Page ${dimension.page}` : ""}
                  <small>{dimension.notes}</small>
                </p>
              ))}
            </>
          )}
          {!!report.assumptions.length && (
            <>
              <h3>Assumptions</h3>
              <ul>
                {report.assumptions.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </>
          )}
          {!!report.warnings.length && (
            <div className="margin-warning">
              <h3>Plan warnings / estimating notes</h3>
              <ul>
                {report.warnings.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      ))}
      <h3 className="subheading">Plans & documents</h3>
      <p className="muted">
        PDF plans, engineer drawings or photos · up to 8 files, 2 MB each.
        Stored in this browser. Save the quote after attaching; total browser
        storage may be smaller than combined file sizes.
      </p>
      <fieldset disabled={locked || uploading || busy}>
        <label className="upload">
          {uploading
            ? "Reading documents…"
            : "Attach plans / drawings / images"}
          <input
            aria-label="Attach plans"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => {
              void attach(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </fieldset>
      <div className="document-list">
        {q.documents.map((d) => (
          <div key={d.id}>
            <button
              className="button secondary document-name"
              onClick={() => setSelected(selected === d.id ? null : d.id)}
            >
              {d.name}
            </button>
            <label className="check-options">
              <input
                type="checkbox"
                disabled={busy || locked}
                checked={!excludedDocuments.includes(d.id)}
                onChange={(e) => {
                  setDetailsInspected(false);
                  setOriginalOnlyConfirmed(false);
                  setExcludedDocuments(
                    e.target.checked
                      ? excludedDocuments.filter((id) => id !== d.id)
                      : [...excludedDocuments, d.id],
                  );
                }}
              />
              Include in analysis
            </label>
            <fieldset disabled={locked || uploading || busy}>
              <label className="replace-document">
                Replace
                <input
                  aria-label={`Replace ${d.name}`}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    void attach(e.target.files, d.id);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="icon danger"
                aria-label={`Remove document ${d.name}`}
                onClick={() => {
                  onChange({
                    ...q,
                    documents: q.documents.filter((x) => x.id !== d.id),
                    takeoff: q.takeoff.map((t) =>
                      t.documentId === d.id
                        ? {
                            ...t,
                            status: "Proposed",
                            confidence: "Unspecified",
                            reviewAcknowledged: false,
                            scopeVerified: false,
                            sourceDetailView: null,
                          }
                        : t,
                    ),
                  });
                  setSelected(null);
                }}
              >
                <Trash2 size={17} />
              </button>
            </fieldset>
          </div>
        ))}
      </div>
      {current && (
        <DocumentPreview
          document={current}
          rotations={
            orientations[current.id]?.source === current.data
              ? orientations[current.id].pages
              : {}
          }
          onRotation={(page, rotation) =>
            setOrientations((previous) => ({
              ...previous,
              [current.id]: {
                source: current.data,
                pages: {
                  ...(previous[current.id]?.source === current.data
                    ? previous[current.id].pages
                    : {}),
                  [page]: rotation,
                },
              },
            }))
          }
          onDetailBusy={setDetailRendering}
          detailsDisabled={
            locked ||
            busy ||
            uploading ||
            detailProcessing ||
            validDetails.length >= maxDetailRegions
          }
          onDetail={(region) => {
            if (validDetails.length >= maxDetailRegions) {
              onError("Include up to 24 detail views per analysis.");
              return;
            }
            if (
              validDetails.some(
                (v) =>
                  v.documentId === current.id &&
                  v.region.page === region.page &&
                  v.region.rotation === region.rotation &&
                  v.region.x === region.x &&
                  v.region.y === region.y &&
                  v.region.width === region.width &&
                  v.region.height === region.height,
              )
            ) {
              onError("This PDF detail view is already included.");
              return;
            }
            setDetailsInspected(false);
            setOriginalOnlyConfirmed(false);
            setExcludedDocuments((ids) =>
              ids.filter((id) => id !== current.id),
            );
            setDetailViews([
              ...validDetails,
              {
                id: id(),
                documentId: current.id,
                originalData: current.data,
                region,
              },
            ]);
          }}
        />
      )}
      {current?.type === "application/pdf" && (
        <AutoDetailSelection
          source={current}
          existing={validDetails
            .filter((v) => v.documentId === current.id)
            .map((v) => v.region)}
          remainingCapacity={maxDetailRegions - validDetails.length}
          remainingAutomatic={Math.max(
            0,
            20 - validDetails.filter((v) => v.automatic).length,
          )}
          disabled={locked || busy || uploading || detailProcessing}
          onBusy={setAutomaticRendering}
          onAdd={(regions) => {
            setDetailsInspected(false);
            setOriginalOnlyConfirmed(false);
            setExcludedDocuments((ids) =>
              ids.filter((id) => id !== current.id),
            );
            setDetailViews((previous) => [
              ...previous,
              ...regions.map((region) => ({
                id: id(),
                documentId: current.id,
                originalData: current.data,
                region,
                automatic: true,
              })),
            ]);
          }}
        />
      )}
      {!!validDetails.length && (
        <div className="pdf-detail-list">
          <h3>Detail views included in analysis</h3>
          <p className="tiny">
            Temporary 250 DPI views rendered directly from the original PDF. Up
            to 20 automatic / 24 total; each analysis request must fit 8 MB.
            Larger detail packages use bounded batches. Re-add views after
            leaving this tab. Only views from selected source files are sent.
          </p>
          {validDetails.some((v) => v.automatic) && (
            <label className="check-options">
              <input
                type="checkbox"
                disabled={busy || detailProcessing || !allPreviewsReady}
                checked={detailsInspected && allPreviewsReady}
                onChange={(e) => setDetailsInspected(e.target.checked)}
              />
              I inspected all selected automatic detail views and their source
              regions.
            </label>
          )}
          <div className="detail-gallery-controls">
            <label className="field">
              <span>Review drawing details</span>
              <select
                aria-label="Detail review group"
                value={
                  detailGroups.includes(detailGroup)
                    ? detailGroup
                    : "All details"
                }
                onChange={(e) => setDetailGroup(e.target.value)}
              >
                <option>All details</option>
                {detailGroups.map((group) => (
                  <option key={group}>{group}</option>
                ))}
              </select>
            </label>
            <span>
              {validDetails.length} views · choose a group to compare related
              details. Exclude anything unnecessary.
            </span>
          </div>
          <div className="detail-gallery">
            {validDetails.map((view) => (
              <div
                className="detail-review-item"
                hidden={
                  detailGroups.includes(detailGroup) &&
                  detailGroup !== (view.region.reviewGroup || "Manual details")
                }
                key={view.id}
              >
                <label className="check-options">
                  <input
                    type="checkbox"
                    aria-label={`Include detail ${view.region.label || view.region.page} in analysis`}
                    checked={
                      !excludedDetails.includes(view.id) &&
                      !excludedDocuments.includes(view.documentId)
                    }
                    disabled={locked || busy || detailProcessing}
                    onChange={(e) => {
                      setDetailsInspected(false);
                      setOriginalOnlyConfirmed(false);
                      setExcludedDetails((ids) =>
                        e.target.checked
                          ? ids.filter((id) => id !== view.id)
                          : [...ids, view.id],
                      );
                      if (e.target.checked)
                        setExcludedDocuments((ids) =>
                          ids.filter((id) => id !== view.documentId),
                        );
                    }}
                  />
                  Include this detail in analysis
                </label>
                <DetailViewEditor
                  source={q.documents.find((d) => d.id === view.documentId)!}
                  region={view.region}
                  disabled={locked || busy || detailProcessing}
                  onBusy={setDetailRendering}
                  onPreviewReady={(ready) =>
                    setPreviewReady((previous) => {
                      if (ready && previous[view.id] === view.region.data)
                        return previous;
                      const next = { ...previous };
                      if (ready) next[view.id] = view.region.data;
                      else delete next[view.id];
                      return next;
                    })
                  }
                  onChange={(region) => {
                    setDetailsInspected(false);
                    setDetailViews((previous) =>
                      previous.map((v) =>
                        v.id === view.id ? { ...v, region } : v,
                      ),
                    );
                  }}
                />
                <span>
                  {q.documents.find((d) => d.id === view.documentId)?.name} ·
                  Page {view.region.page} · {view.region.pixelWidth} ×{" "}
                  {view.region.pixelHeight} px · 250 DPI ·{" "}
                  {view.region.rotation ?? 0}°
                </span>
                <button
                  className="icon danger"
                  disabled={locked || busy}
                  aria-label={`Remove detail view ${view.region.page}`}
                  onClick={() =>
                    setDetailViews(detailViews.filter((v) => v.id !== view.id))
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="tiny">
        PDF analysis sends the unchanged original file plus its selectable text
        when available. The preview canvas is never an analysis source. Add
        detail views for fine notes on large sheets; no OCR guesses are used.
      </p>
      <h3 className="subheading">Estimate candidates / Takeoff items</h3>
      {reviewError && (
        <p className="error" role="alert">
          {reviewError}
        </p>
      )}
      <p className="muted">
        Changing a measurement resets it to Proposed. Replacing or removing a
        source document also requires re-review. Existing converted estimate
        lines are preserved and must be checked separately.
      </p>
      {!!q.takeoff.some((t) => t.origin === "ai") && (
        <div className="heading-actions">
          <button
            className="button secondary"
            disabled={locked || !selectedItems.length}
            onClick={() => bulkApprove()}
          >
            Approve selected reviewed items
          </button>
          <button
            className="button secondary"
            disabled={
              locked ||
              !q.takeoff.some(
                (t) =>
                  t.origin === "ai" &&
                  t.status === "Reviewed" &&
                  t.reviewAcknowledged &&
                  !t.convertedLineId,
              )
            }
            onClick={() => bulkApprove(true)}
          >
            Approve all reviewed items
          </button>
        </div>
      )}
      <button
        className="button secondary"
        disabled={locked || busy || !q.takeoff.length}
        onClick={() =>
          window.confirm(
            "Consolidate exact unreviewed duplicates? Quantities will not be added; distinct specifications, assemblies and sources remain separate.",
          ) && onChange({ ...q, takeoff: consolidateTakeoff(q.takeoff) })
        }
      >
        Consolidate exact unreviewed duplicates
      </button>
      <TakeoffTable
        quote={q}
        locked={locked || busy}
        onChange={onChange}
        patch={patch}
        updateItem={updateItem}
        onError={setReviewError}
        selected={selectedItems}
        setSelected={setSelectedItems}
      />
      <button
        className="button secondary"
        disabled={locked}
        onClick={() =>
          onChange({
            ...q,
            takeoff: [
              ...q.takeoff,
              {
                id: id(),
                description: "",
                quantity: null,
                unit: "each",
                documentId: "",
                page: null,
                notes: "",
                status: "Proposed",
                confidence: "Unspecified",
              },
            ],
          })
        }
      >
        <Plus size={17} />
        Add takeoff item
      </button>
    </>
  );
}
