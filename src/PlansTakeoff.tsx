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
} from "../shared/analysis";
import { validatePlanFile } from "./validatePlanFile";
import PdfPreview from "./PdfPreview";
import { useEffect, useState, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import NumberInput from "./NumberInput";
import { id, units, categories, takeoffToLine } from "./model";
import type { Quote, PlanDocument, TakeoffItem, Kind } from "./model";
function DocumentPreview({ document: d }: { document: PlanDocument }) {
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
        <PdfPreview url={url} />
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
export default function PlansTakeoff({
  quote: q,
  locked,
  onChange,
  onError,
  onViewEstimate,
}: {
  quote: Quote;
  locked: boolean;
  onChange: (q: Quote) => void;
  onError: (s: string) => void;
  onViewEstimate?: () => void;
}) {
  const [excludedDocuments, setExcludedDocuments] = useState<string[]>([]);
  const latest = useRef(q);
  latest.current = q;
  const request = useRef<AbortController | null>(null);
  const [analysisState, setAnalysisState] = useState("Ready to analyze");
  const [analysisError, setAnalysisError] = useState("");
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
    if (request.current || locked) return;
    const controller = new AbortController();
    request.current = controller;
    setAnalysisError("");
    setAnalysisState("Uploading/preparing");
    try {
      const documents = structuredClone(
        latest.current.documents.filter(
          (d) => !excludedDocuments.includes(d.id),
        ),
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
      setAnalysisState("Analyzing plans");
      const result = await planAnalysisService.analyze(
        documents,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (
        (await documentFingerprint(
          latest.current.documents.filter((d) =>
            documents.some((source) => source.id === d.id),
          ),
        )) !== fingerprint
      )
        throw new Error(
          "Source files changed during analysis. Results were not added; analyze the current files.",
        );
      onChange(addAnalysisSuggestions(latest.current, result, fingerprint));
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
      onChange({
        ...q,
        takeoff: q.takeoff.map((t) => (t.id === item.id ? next : t)),
      });
    } catch (error) {
      onError((error as Error).message);
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
      onChange({
        ...q,
        takeoff: q.takeoff.map((t) => approved.find((a) => a.id === t.id) ?? t),
      });
      setSelectedItems([]);
    } catch (error) {
      onError((error as Error).message);
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
              <small>
                {[
                  report.project.drawingNumbers.join(", "),
                  report.project.revision,
                  report.project.date,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </>
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
      {current && <DocumentPreview document={current} />}
      <h3 className="subheading">Takeoff items</h3>
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
      {q.takeoff.map((t) => (
        <fieldset className="line-card" key={t.id} disabled={locked}>
          <div className="line-title">
            <Field label="Takeoff description">
              <input
                value={t.description}
                onChange={(e) => patch(t, { description: e.target.value })}
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
          {t.origin === "ai" && (
            <>
              <p className={`confidence ${t.confidence.toLowerCase()}`}>
                <b>{t.confidence.toUpperCase()} confidence</b> ·{" "}
                {t.classification} · {t.status}
              </p>
              {t.quantity === null && (
                <p className="margin-warning">
                  Requires contractor input — no quantity was invented.
                </p>
              )}
              <p className="tiny">
                Source: {t.sourceDocumentName}
                {t.page ? ` — Page ${t.page}` : ""}. Verify the source and
                uncertainty before approval.
              </p>
              {!!t.assumptions?.length && (
                <p>Assumptions: {t.assumptions.join("; ")}</p>
              )}
              {!!t.warnings?.length && (
                <p className="margin-warning">
                  Needs verification: {t.warnings.join("; ")}
                </p>
              )}
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
                    onChange={(e) => patch(t, { category: e.target.value })}
                  >
                    {[
                      ...new Set([
                        ...categories,
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
                    disabled={t.status !== "Reviewed" || !t.reviewAcknowledged}
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
            <Field label="Source document">
              <select
                value={t.documentId}
                onChange={(e) => patch(t, { documentId: e.target.value })}
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
                onChange={(n) => patch(t, { page: Number.isNaN(n) ? null : n })}
              />
            </Field>
            <Field label="Confidence">
              <select
                value={t.confidence}
                onChange={(e) =>
                  patch(t, {
                    confidence: e.target.value as TakeoffItem["confidence"],
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
                            status: e.target.value as TakeoffItem["status"],
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
          {t.convertedLineId ? (
            <p className="tiny">
              Converted to an estimate line. Review that line separately if
              source measurements change.
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
                    onError((err as Error).message);
                  }
                }}
              >
                <option value="">Choose line type…</option>
                {(t.origin === "ai"
                  ? [
                      t.destination === "Subcontractor"
                        ? "Other Costs"
                        : t.destination,
                    ].filter((k) => k !== "Informational" && k !== undefined)
                  : ["Materials", "Labour", "Other Costs"]
                ).map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </Field>
          )}
        </fieldset>
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
