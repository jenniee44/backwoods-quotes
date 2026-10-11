import { useEffect, useState } from "react";
import type { Quote, TakeoffItem } from "./model";
import {
  prepareMaterialsSummary,
  summaryApprovalProblem,
  approveSummaryMaterials,
  sendShoppingList,
} from "./materialsSummary";
import {
  quickMaterialDraft,
  quickMaterialChanges,
  applyQuickMaterialChanges,
  needsStockLength,
  materialStockLength,
} from "./quickMaterialEdit";
import { materialNextAction } from "./materialReviewPresentation";
import { readyForEstimate } from "./takeoffReview";
import { includedScope, workScope } from "./takeoffScope";

export default function MaterialsSummary({
  quote: q,
  locked,
  onChange,
  onError,
  onAdvanced,
}: {
  quote: Quote;
  locked: boolean;
  onChange: (q: Quote) => void;
  onError: (s: string) => void;
  onAdvanced: () => void;
}) {
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<"summary" | "shopping">("summary");
  const [selected, setSelected] = useState<string[]>([]);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (locked) return;
    const takeoff = prepareMaterialsSummary(q.takeoff);
    if (JSON.stringify(takeoff) !== JSON.stringify(q.takeoff))
      onChange({ ...q, takeoff });
  }, [q, locked, onChange]);
  // Any edit/source change requires another explicit batch verification.
  useEffect(() => {
    setVerified(false);
    setSelected([]);
  }, [q.takeoff]);
  const materials = q.takeoff.filter(
    (t) =>
      (t.destination ?? "Materials") === "Materials" &&
      (!t.itemRole || t.itemRole === "Construction item"),
  );
  const approved = materials.filter((t) => t.status === "Approved");
  const eligible = materials.filter((t) => !summaryApprovalProblem(q, t));
  const attention = materials.filter(
    (t) =>
      !t.convertedLineId &&
      t.status !== "Approved" &&
      t.status !== "Rejected" &&
      (includedScope(t) || workScope(t) === "Requires scope confirmation") &&
      summaryApprovalProblem(q, t),
  );
  const shown = view === "shopping" ? approved : materials;
  function change(
    t: TakeoffItem,
    delta: Partial<ReturnType<typeof quickMaterialDraft>>,
  ) {
    try {
      const draft = { ...quickMaterialDraft(t), ...delta };
      const next = applyQuickMaterialChanges(t, quickMaterialChanges(t, draft));
      onError("");
      onChange({
        ...q,
        takeoff: q.takeoff.map((item) => (item.id === t.id ? next : item)),
      });
    } catch (e) {
      onError((e as Error).message);
      setRevision((n) => n + 1);
    }
  }
  function approve() {
    try {
      onChange(approveSummaryMaterials(q, selected, verified));
      onError("");
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <section className="materials-summary" aria-label="Materials Summary">
      <h3>Materials Summary</h3>
      <p className="tiny">
        Changes save when you leave a cell. Verify the drawing, specifications
        and purchase quantities before approval. Missing measurements are never
        guessed.
      </p>
      <div className="heading-actions">
        <button
          className={"button " + (view === "summary" ? "" : "secondary")}
          onClick={() => setView("summary")}
          aria-pressed={view === "summary"}
        >
          Materials Summary
        </button>
        <button
          className={"button " + (view === "shopping" ? "" : "secondary")}
          onClick={() => setView("shopping")}
          aria-pressed={view === "shopping"}
        >
          Final Shopping List ({approved.length})
        </button>
      </div>
      {view === "summary" && (
        <>
          <details className="summary-attention">
            <summary>
              Needs Attention — {attention.length} material
              {attention.length === 1 ? "" : "s"}
            </summary>
            {attention.slice(0, 8).map((t) => (
              <p key={t.id}>
                <a href={"#summary-" + t.id}>
                  {t.description || "Unnamed material"}
                </a>{" "}
                —{" "}
                {materialNextAction(q, t) ||
                  "Verify quantity and specifications"}{" "}
                <button className="button secondary" onClick={onAdvanced}>
                  Review details
                </button>
              </p>
            ))}
            {attention.length > 8 && (
              <p>
                {attention.length - 8} more materials need review; warnings
                appear beside each row.
              </p>
            )}
          </details>
          <div className="summary-bulk">
            <button
              className="button secondary"
              disabled={locked || !eligible.length}
              onClick={() => setSelected(eligible.map((t) => t.id))}
            >
              Select eligible materials ({eligible.length})
            </button>
            <label className="check-options">
              <input
                type="checkbox"
                checked={verified}
                disabled={locked}
                onChange={(e) => setVerified(e.target.checked)}
              />
              I verified the selected specifications, purchase quantities, scope
              and drawing evidence.
            </label>
            <button
              className="button"
              disabled={locked || !verified || !selected.length}
              onClick={approve}
            >
              Approve selected materials ({selected.length})
            </button>
          </div>
        </>
      )}
      <table className="materials-summary-table">
        <caption className="sr-only">
          {view === "shopping"
            ? "Final Shopping List"
            : "Consolidated materials"}
        </caption>
        <thead>
          <tr>
            <th>Material description</th>
            <th>Specifications</th>
            <th>Quantity</th>
            <th>Unit / stock length</th>
            <th>Include / Exclude</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => {
            const disabled = locked || !!t.convertedLineId;
            const problem = summaryApprovalProblem(q, t);
            return (
              <tr key={t.id} id={"summary-" + t.id}>
                <td data-label="Material description">
                  {view === "summary" && (
                    <label className="check-options">
                      <input
                        type="checkbox"
                        aria-label={"Select " + t.description}
                        checked={selected.includes(t.id)}
                        disabled={disabled || !!problem}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, t.id]
                              : ids.filter((id) => id !== t.id),
                          )
                        }
                      />
                    </label>
                  )}
                  <textarea
                    rows={3}
                    aria-label={"Material description: " + t.id}
                    defaultValue={t.description}
                    key={String(t.description) + revision}
                    disabled={disabled}
                    onBlur={(e) => {
                      if (e.target.value !== t.description)
                        change(t, { description: e.target.value });
                    }}
                  />
                </td>
                <td data-label="Specifications">
                  <textarea
                    rows={2}
                    aria-label={"Specifications: " + t.id}
                    defaultValue={t.specification ?? ""}
                    key={String(t.specification) + revision}
                    disabled={disabled}
                    onBlur={(e) => {
                      if (e.target.value !== (t.specification ?? ""))
                        change(t, { specification: e.target.value });
                    }}
                  />
                </td>
                <td data-label="Quantity">
                  {t.quantity === null && <small>Quantity needed</small>}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    placeholder="Quantity needed"
                    aria-label={"Quantity: " + t.id}
                    defaultValue={t.quantity ?? ""}
                    key={String(String(t.quantity)) + revision}
                    disabled={disabled}
                    onBlur={(e) => {
                      const n =
                        e.target.value === "" ? null : Number(e.target.value);
                      if (n !== t.quantity) change(t, { quantity: n });
                    }}
                  />
                  {t.calculation && (
                    <small>
                      {t.calculation.verified
                        ? "Calculated from verified inputs"
                        : "Calculator inputs need verification"}
                    </small>
                  )}
                </td>
                <td data-label="Unit / stock length">
                  <input
                    aria-label={"Unit: " + t.id}
                    defaultValue={t.unit}
                    key={String(t.unit) + revision}
                    disabled={disabled}
                    onBlur={(e) => {
                      if (e.target.value !== t.unit)
                        change(t, { unit: e.target.value });
                    }}
                  />
                  {needsStockLength(t) && (
                    <label>
                      Stock length (ft)
                      <input
                        type="number"
                        step="any"
                        min="0"
                        aria-label={"Stock length: " + t.id}
                        placeholder="Length needed"
                        defaultValue={materialStockLength(t) ?? ""}
                        key={String(String(materialStockLength(t))) + revision}
                        disabled={disabled}
                        onBlur={(e) => {
                          const n =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value);
                          if (n !== materialStockLength(t))
                            change(t, { stockLength: n });
                        }}
                      />
                    </label>
                  )}
                </td>
                <td data-label="Include / Exclude">
                  <select
                    aria-label={"Include: " + t.id}
                    value={
                      includedScope(t) && t.status !== "Rejected" ? "Yes" : "No"
                    }
                    disabled={disabled}
                    onChange={(e) =>
                      change(t, { included: e.target.value === "Yes" })
                    }
                  >
                    <option
                      disabled={[
                        "Existing work to remain",
                        "Requires scope confirmation",
                      ].includes(workScope(t))}
                    >
                      Yes
                    </option>
                    <option>No</option>
                  </select>
                </td>
                <td data-label="Status">
                  <strong>
                    {t.convertedLineId
                      ? "Added to estimate"
                      : t.status === "Approved"
                        ? "Approved"
                        : !includedScope(t) || t.status === "Rejected"
                          ? "Excluded"
                          : problem
                            ? "Needs attention"
                            : "Ready for review"}
                  </strong>
                  {!t.convertedLineId &&
                    t.status !== "Approved" &&
                    includedScope(t) && (
                      <small>{materialNextAction(q, t)}</small>
                    )}
                  {!!problem &&
                    !t.convertedLineId &&
                    t.status !== "Approved" && (
                      <button className="button secondary" onClick={onAdvanced}>
                        Review details
                      </button>
                    )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!shown.length && (
        <p>
          {view === "shopping"
            ? "Approve verified materials to build your shopping list."
            : "Analyze drawings or add materials in Advanced Review to begin."}
        </p>
      )}
      {view === "shopping" && (
        <>
          <p>
            {approved.filter((t) => !t.convertedLineId).length} approved
            material(s) waiting to be added. Existing estimate lines remain
            unchanged; prices are entered in the estimate.
          </p>
          <button
            className="button"
            disabled={locked || !approved.some((t) => readyForEstimate(q, t))}
            onClick={() => {
              try {
                onChange(sendShoppingList(q));
                onError("");
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          >
            Send approved materials to estimate
          </button>
        </>
      )}
    </section>
  );
}
