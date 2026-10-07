import { preparePlanAnalysis } from "./preparePlanAnalysis";
import { maxDetailRegions } from "../shared/pdf";
import type { PdfDetailRegion, PdfRotation } from "../shared/pdf";
import {
  planAnalysisService,
  documentFingerprint,
  addAnalysisSuggestions,
  editTakeoff,
  reviewTakeoff,
  approveTakeoff,
  canConvert,
} from "./planAnalysis";
import {
  destinations,
  classifications,
  validateDocuments,
  constructionGroups,
  materialCategories,
} from "../shared/analysis";
import { scopeFor, requiresScopeVerification } from "../shared/takeoff";
import { validatePlanFile } from "./validatePlanFile";
import PdfPreview from "./PdfPreview";
import { useEffect, useState, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import NumberInput from "./NumberInput";
import { id, units, categories, takeoffToLine } from "./model";
import type { Quote, PlanDocument, TakeoffItem, Kind } from "./model";
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
const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
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
  // Temporary lossless detail views. Bound to exact source bytes; not saved in
  // customer records, persisted attachments, or reused after PDF replacement.
  const [detailViews, setDetailViews] = useState<
    {
      id: string;
      documentId: string;
      originalData: string;
      region: PdfDetailRegion;
    }[]
  >([]);
  const validDetails = detailViews.filter((view) =>
    q.documents.some(
      (d) => d.id === view.documentId && d.data === view.originalData,
    ),
  );
  const latest = useRef(q);
  latest.current = q;
  const request = useRef<AbortController | null>(null);
  const [analysisState, setAnalysisState] = useState("Ready to analyze");
  const [analysisError, setAnalysisError] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [inputNotes, setInputNotes] = useState<string[]>([]);
  const [detailRendering, setDetailRendering] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const takeoffGroups = [
    ...new Set(q.takeoff.map((item) => scopeFor(item))),
  ].sort((a, b) => {
    const index = (group: string) => {
      const i = constructionGroups.indexOf(group);
      return i < 0 ? constructionGroups.length - 1 : i;
    };
    return index(a) - index(b);
  });
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
    if (request.current || locked || detailRendering) return;
    const controller = new AbortController();
    request.current = controller;
    setAnalysisError("");
    setReviewError("");
    setInputNotes([]);
    setAnalysisState("Uploading/preparing");
    try {
      const documents = structuredClone(
        latest.current.documents
          .filter((d) => !excludedDocuments.includes(d.id))
          .map((d) => ({
            ...d,
            ...(validDetails.some((v) => v.documentId === d.id)
              ? {
                  detailRegions: validDetails
                    .filter((v) => v.documentId === d.id)
                    .map((v) => v.region),
                }
              : {}),
          })),
      );
      validateDocuments(documents);
      const fingerprint = await documentFingerprint(documents);
      if (
        latest.current.analysisReports?.some(
          (report) => report.fingerprint === fingerprint,
        )
      )
        throw new Error(
          "These plans have already been analyzed. Review the existing proposed items.",
        );
      const prepared = await preparePlanAnalysis(documents, controller.signal);
      controller.signal.throwIfAborted();
      setInputNotes(
        prepared
          .filter((d) => d.type === "application/pdf")
          .flatMap((d) => {
            const layer = d.pdfText;
            const notes = [
              `${d.name}: unchanged original PDF + selectable text from ${layer?.pages.filter((p) => p.text).length ?? 0} page(s) + ${d.detailRegions?.length ?? 0} lossless detail view(s).`,
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
      const result = await planAnalysisService.analyze(
        prepared,
        controller.signal,
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
        addAnalysisSuggestions(latest.current, result, fingerprint, documents),
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
      const approved = chosen.map(approveTakeoff);
      setReviewError("");
      onChange({
        ...q,
        takeoff: q.takeoff.map((t) => approved.find((a) => a.id === t.id) ?? t),
      });
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
      <div className="heading-actions">
        <button
          className="button"
          disabled={
            locked ||
            busy ||
            detailRendering ||
            uploading ||
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
      <p role="status" aria-live="polite">
        {uploading ? "Uploading/preparing" : analysisState}
      </p>
      {busy && <progress aria-label="Plan analysis progress" />}
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
                onChange={(e) =>
                  setExcludedDocuments(
                    e.target.checked
                      ? excludedDocuments.filter((id) => id !== d.id)
                      : [...excludedDocuments, d.id],
                  )
                }
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
            validDetails.length >= maxDetailRegions
          }
          onDetail={(region) => {
            if (validDetails.length >= maxDetailRegions) {
              onError("Include up to four detail views per analysis.");
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
      {!!validDetails.length && (
        <div className="pdf-detail-list">
          <h3>Detail views included in analysis</h3>
          <p className="tiny">
            Temporary 250 DPI PNG views, rendered directly from the original
            PDF. Up to four; original files + details must fit within 4 MB.
            Re-add views after leaving this tab. Only views from selected source
            files are sent.
          </p>
          {validDetails.map((view) => (
            <div key={view.id}>
              <span>
                {q.documents.find((d) => d.id === view.documentId)?.name} · Page{" "}
                {view.region.page} · {view.region.pixelWidth} ×{" "}
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
      <datalist id="takeoff-units">
        {units.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
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
      {takeoffGroups.map((group) => (
        <section className="takeoff-group" key={group}>
          <h3>
            {group}{" "}
            <span className="tiny">
              ({q.takeoff.filter((t) => scopeFor(t) === group).length})
            </span>
          </h3>
          {q.takeoff
            .filter((t) => scopeFor(t) === group)
            .map((t) => (
              <fieldset className="line-card" key={t.id} disabled={locked}>
                <div className="line-title">
                  <Field label="Takeoff description">
                    <input
                      value={t.description}
                      onChange={(e) =>
                        patch(t, { description: e.target.value })
                      }
                    />
                  </Field>
                  <button
                    className="icon danger"
                    aria-label={`Remove takeoff ${t.description || "item"}`}
                    onClick={() =>
                      onChange({
                        ...q,
                        takeoff: q.takeoff.filter((x) => x.id !== t.id),
                      })
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
                {t.specification && (
                  <p className="takeoff-specification">{t.specification}</p>
                )}
                <div className="fields compact">
                  <Field label="Takeoff quantity">
                    <NumberInput
                      value={t.quantity}
                      nullable={t.origin === "ai"}
                      placeholder="Requires contractor input"
                      onChange={(n) =>
                        patch(t, { quantity: Number.isNaN(n) ? null : n })
                      }
                    />
                  </Field>
                  <Field label="Takeoff unit">
                    <input
                      list="takeoff-units"
                      value={t.unit}
                      onChange={(e) => patch(t, { unit: e.target.value })}
                    />
                  </Field>
                </div>
                {t.origin === "ai" && (
                  <>
                    <p className={`confidence ${t.confidence.toLowerCase()}`}>
                      <b>{t.confidence.toUpperCase()} confidence</b> ·{" "}
                      {t.classification} · {t.status}
                    </p>
                    {t.quantity === null && (
                      <p className="margin-warning">
                        Requires contractor input —{" "}
                        {t.destination === "Labour"
                          ? "enter verified labour hours; no hours were invented."
                          : "no quantity was invented."}
                      </p>
                    )}
                    <p className="tiny">
                      {t.category ?? "Miscellaneous"} · Source:{" "}
                      {t.sourceDocumentName}
                      {t.page ? ` — Page ${t.page}` : ""}
                      {t.sourceDetailView
                        ? ` · Detail view ${t.sourceDetailView}`
                        : ""}
                      . Verify the source and uncertainty before approval.
                    </p>
                    {t.supportBasis && t.supportBasis !== "Not established" && (
                      <p className="tiny">Support basis: {t.supportBasis}</p>
                    )}
                    {requiresScopeVerification(t) && !t.convertedLineId && (
                      <label className="check-options">
                        <input
                          type="checkbox"
                          checked={!!t.scopeVerified}
                          onChange={(e) =>
                            patch(t, { scopeVerified: e.target.checked })
                          }
                        />
                        I verified existing/new/by-others status and this item
                        is included in our contract scope.
                      </label>
                    )}
                    {!!t.warnings?.length && (
                      <p className="takeoff-verification">
                        <b>Verify:</b> {t.warnings[0]}
                        {t.warnings.length > 1
                          ? ` (+${t.warnings.length - 1} more in evidence)`
                          : ""}
                      </p>
                    )}
                    <div className="check-options">
                      <label>
                        <input
                          type="checkbox"
                          disabled={t.convertedLineId !== undefined}
                          checked={selectedItems.includes(t.id)}
                          onChange={(e) =>
                            setSelectedItems(
                              e.target.checked
                                ? [...selectedItems, t.id]
                                : selectedItems.filter((id) => id !== t.id),
                            )
                          }
                        />
                        Select for approval
                      </label>
                    </div>
                    {!t.convertedLineId && (
                      <div className="heading-actions">
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => updateItem(t, reviewTakeoff)}
                        >
                          Mark reviewed — I verified this item
                        </button>
                        <button
                          type="button"
                          className="button"
                          disabled={
                            t.status !== "Reviewed" || !t.reviewAcknowledged
                          }
                          onClick={() => updateItem(t, approveTakeoff)}
                        >
                          Approve item
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() =>
                            updateItem(t, (item) => ({
                              ...item,
                              status: "Rejected",
                              reviewAcknowledged: false,
                            }))
                          }
                        >
                          Reject item
                        </button>
                      </div>
                    )}
                  </>
                )}
                <details
                  className="takeoff-evidence"
                  open={t.origin !== "ai" || expandedItems.includes(t.id)}
                  onToggle={(event) => {
                    if (event.currentTarget.open)
                      setExpandedItems((ids) =>
                        ids.includes(t.id) ? ids : [...ids, t.id],
                      );
                    else
                      setExpandedItems((ids) =>
                        ids.filter((id) => id !== t.id),
                      );
                  }}
                >
                  <summary>Evidence & editing details</summary>
                  {t.origin === "ai" && (
                    <>
                      {!!t.assumptions?.length && (
                        <p>Assumptions: {t.assumptions.join("; ")}</p>
                      )}
                      {!!t.warnings?.length && (
                        <p>All verification notes: {t.warnings.join("; ")}</p>
                      )}
                      {t.specification && (
                        <p>
                          <b>Written specification:</b> {t.specification}
                        </p>
                      )}
                      {t.location && (
                        <p>
                          <b>Location:</b> {t.location}
                        </p>
                      )}
                      {!!t.sourceFacts?.length && (
                        <div>
                          <b>Source facts</b>
                          <ul>
                            {t.sourceFacts.map((fact, i) => (
                              <li key={i}>{fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {t.calculationBasis && (
                        <p>
                          <b>Calculation basis:</b> {t.calculationBasis}
                        </p>
                      )}
                      {t.quantityMethod && (
                        <p className="tiny">
                          Quantity basis: {t.quantityMethod}
                        </p>
                      )}
                      {t.subcontractorBasis && (
                        <p className="tiny">
                          Subcontracting basis: {t.subcontractorBasis}
                        </p>
                      )}
                      <div className="fields">
                        <Field label="Construction scope group">
                          <input
                            value={t.scopeGroup ?? scopeFor(t)}
                            onChange={(e) =>
                              patch(t, { scopeGroup: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Location / assembly">
                          <input
                            value={t.location ?? ""}
                            onChange={(e) =>
                              patch(t, { location: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Source facts">
                          <textarea
                            value={(t.sourceFacts ?? []).join("\n")}
                            onChange={(e) =>
                              patch(t, {
                                sourceFacts: e.target.value
                                  .split("\n")
                                  .filter(Boolean),
                              })
                            }
                          />
                        </Field>
                        <Field label="Written specification">
                          <textarea
                            value={t.specification ?? ""}
                            onChange={(e) =>
                              patch(t, { specification: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="Calculation basis">
                          <textarea
                            value={t.calculationBasis ?? ""}
                            onChange={(e) =>
                              patch(t, { calculationBasis: e.target.value })
                            }
                          />
                        </Field>
                      </div>
                      <div className="fields">
                        <Field label="Suggested destination">
                          <select
                            value={t.destination}
                            onChange={(e) =>
                              patch(t, {
                                destination: e.target
                                  .value as TakeoffItem["destination"],
                              })
                            }
                          >
                            {destinations.map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Takeoff category">
                          <select
                            value={t.category}
                            onChange={(e) =>
                              patch(t, { category: e.target.value })
                            }
                          >
                            {[
                              ...new Set([
                                ...(t.destination === "Materials"
                                  ? materialCategories
                                  : categories),
                                t.category ?? "Miscellaneous",
                              ]),
                            ].map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Evidence type">
                          <select
                            value={t.classification}
                            onChange={(e) =>
                              patch(t, {
                                classification: e.target
                                  .value as TakeoffItem["classification"],
                              })
                            }
                          >
                            {classifications.map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </>
                  )}
                  <div className="fields compact">
                    <Field label="Source document">
                      <select
                        value={t.documentId}
                        onChange={(e) =>
                          patch(t, { documentId: e.target.value })
                        }
                      >
                        <option value="">Manual / no attached document</option>
                        {t.documentId &&
                          !q.documents.some((d) => d.id === t.documentId) && (
                            <option value={t.documentId}>
                              Removed source document
                            </option>
                          )}
                        {q.documents.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Page number (optional)">
                      <NumberInput
                        nullable
                        step="1"
                        value={t.page}
                        onChange={(n) =>
                          patch(t, { page: Number.isNaN(n) ? null : n })
                        }
                      />
                    </Field>
                    <Field label="Confidence">
                      <select
                        value={t.confidence}
                        onChange={(e) =>
                          patch(t, {
                            confidence: e.target
                              .value as TakeoffItem["confidence"],
                          })
                        }
                      >
                        {["Unspecified", "Low", "Medium", "High"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Review status">
                      <select
                        value={t.status}
                        onChange={(e) =>
                          updateItem(t, (item) =>
                            e.target.value === "Reviewed"
                              ? t.origin === "ai"
                                ? reviewTakeoff(item)
                                : { ...item, status: "Reviewed" }
                              : e.target.value === "Approved"
                                ? approveTakeoff(item)
                                : {
                                    ...item,
                                    status: e.target
                                      .value as TakeoffItem["status"],
                                    reviewAcknowledged: false,
                                  },
                          )
                        }
                      >
                        <option>Proposed</option>
                        <option value="Reviewed">
                          {t.origin === "ai"
                            ? "Reviewed — awaiting approval"
                            : "Approved"}
                        </option>
                        {t.origin === "ai" && (
                          <option value="Approved">Approved</option>
                        )}
                        <option value="Rejected">Rejected</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Takeoff notes / source reference">
                    <textarea
                      value={t.notes}
                      onChange={(e) => patch(t, { notes: e.target.value })}
                    />
                  </Field>
                </details>
                {t.convertedLineId ? (
                  <p className="tiny">
                    Converted to an estimate line. Review that line separately
                    if source measurements change.
                  </p>
                ) : (
                  <Field label="Convert reviewed item to estimate">
                    <select
                      value=""
                      disabled={!canConvert(t) || !t.description.trim()}
                      onChange={(e) => {
                        try {
                          onChange(takeoffToLine(q, t, e.target.value as Kind));
                        } catch (err) {
                          setReviewError((err as Error).message);
                        }
                      }}
                    >
                      <option value="">Choose line type…</option>
                      {(t.origin === "ai"
                        ? [
                            t.destination === "Subcontractor"
                              ? "Other Costs"
                              : t.destination,
                          ].filter(
                            (k) => k !== "Informational" && k !== undefined,
                          )
                        : ["Materials", "Labour", "Other Costs"]
                      ).map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </fieldset>
            ))}
        </section>
      ))}
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
                quantity: 0,
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
