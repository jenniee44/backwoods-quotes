import PdfPreview from "./PdfPreview";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import NumberInput from "./NumberInput";
import { id, units, takeoffToLine } from "./model";
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
}: {
  quote: Quote;
  locked: boolean;
  onChange: (q: Quote) => void;
  onError: (s: string) => void;
}) {
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
          return {
            id: replaceId ?? id(),
            name: f.name,
            type: f.type,
            data,
            addedAt: new Date().toISOString(),
          } as PlanDocument;
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
                ? { ...t, status: "Proposed", confidence: "Unspecified" }
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
        t.id === item.id
          ? { ...t, ...delta, status: delta.status ?? "Proposed" }
          : t,
      ),
    });
  }
  return (
    <>
      <div className="info">
        <b>Contractor-reviewed takeoff</b>
        <p>
          Record your measurements from plans. This version does not interpret
          drawings or check engineering. Future AI results must enter as
          Proposed suggestions and require your review. Confidence is your own
          assessment.
        </p>
      </div>
      <h3 className="subheading">Plans & documents</h3>
      <p className="muted">
        PDF plans, engineer drawings or photos · up to 8 files, 2 MB each.
        Stored in this browser. Save the quote after attaching; total browser
        storage may be smaller than combined file sizes.
      </p>
      <fieldset disabled={locked || uploading}>
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
            <fieldset disabled={locked || uploading}>
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
          <div className="fields compact">
            <Field label="Takeoff quantity">
              <NumberInput
                value={t.quantity}
                onChange={(n) => patch(t, { quantity: n })}
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
                  patch(t, { status: e.target.value as TakeoffItem["status"] })
                }
              >
                <option>Proposed</option>
                <option>Reviewed</option>
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
                disabled={t.status !== "Reviewed" || !t.description.trim()}
                onChange={(e) => {
                  try {
                    onChange(takeoffToLine(q, t, e.target.value as Kind));
                  } catch (err) {
                    onError((err as Error).message);
                  }
                }}
              >
                <option value="">Choose line type…</option>
                {["Materials", "Labour", "Other Costs"].map((k) => (
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
