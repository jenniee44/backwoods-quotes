import { useId, useMemo, useState } from "react";
import type { Quote } from "./model";
import { matchingDrawingObservations } from "./recoverDrawingEvidence";

function formatAnalysisDate(value?: string): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-CA", { dateStyle: "medium" })
    : "Date unavailable";
}

export default function DrawingRecovery({
  target,
  quotes,
  onRecover,
}: {
  target: Quote;
  quotes: Quote[];
  onRecover: (source: Quote) => Promise<boolean>;
}) {
  const title = useId();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [verification, setVerification] = useState<{
    target: Quote;
    source: Quote;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const candidates = useMemo(
    () =>
      open
        ? quotes
            .filter((source) => source.id !== target.id)
            .map((source) => ({
              source,
              observations: matchingDrawingObservations(target, source),
            }))
            .filter((candidate) => candidate.observations.length > 0)
        : [],
    [open, quotes, target],
  );
  const selected = candidates.find(
    (candidate) => candidate.source.id === sourceId,
  );

  const verified =
    verification?.target === target &&
    verification?.source === selected?.source;

  return (
    <section aria-labelledby={open ? title : undefined}>
      <button
        type="button"
        className="button"
        aria-expanded={open}
        disabled={saving}
        onClick={() => {
          setOpen(!open);
          setSourceId("");
          setVerification(null);
        }}
      >
        Recover matching drawing observations
      </button>
      {open && (
        <fieldset className="panel" disabled={saving}>
          <legend id={title}>Choose a verified source quote</legend>
          {candidates.length === 0 ? (
            <p role="status">No new matching drawing observations found.</p>
          ) : (
            <>
              <label className="field">
                Source quote
                <select
                  value={selected?.source.id ?? ""}
                  onChange={(event) => {
                    setSourceId(event.target.value);
                    setVerification(null);
                  }}
                >
                  <option value="">Select a matching quote</option>
                  {candidates.map(({ source, observations }) => (
                    <option key={source.id} value={source.id}>
                      {source.number} · {source.name} · {observations.length}{" "}
                      available
                    </option>
                  ))}
                </select>
              </label>
              {selected && (
                <>
                  <h3>
                    {selected.source.number} · {selected.source.name}
                  </h3>
                  <ul aria-label="Available observations">
                    {selected.observations.map(
                      ({ item, document, key, analysisDate }) => (
                        <li key={key}>
                          <strong>{item.description}</strong>
                          <div>
                            {document.name}
                            {item.page === null ? "" : " · Page " + item.page}
                          </div>
                          <div>
                            Analysis date: {formatAnalysisDate(analysisDate)}
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                  <label>
                    <input
                      type="checkbox"
                      checked={verified}
                      onChange={(event) =>
                        setVerification(
                          event.target.checked
                            ? { target, source: selected.source }
                            : null,
                        )
                      }
                    />{" "}
                    I verified this source quote and drawing.
                  </label>
                  <p className="muted">
                    Recovered observations need manual review before they can be
                    added to the estimate.
                  </p>
                  <button
                    type="button"
                    className="button"
                    disabled={!verified || saving}
                    onClick={async () => {
                      if (saving || !verified) return;
                      setSaving(true);
                      try {
                        if (await onRecover(selected.source)) {
                          setOpen(false);
                          setSourceId("");
                          setVerification(null);
                        }
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Recover from selected quote
                  </button>
                </>
              )}
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
