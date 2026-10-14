import BeamShoppingList from "./BeamShoppingList";
import GroupedMaterialsEditor from "./GroupedMaterialsEditor";
import { relevantSpecifications } from "./materialReferences";
import { purchasingGroups } from "./purchasingGroups";
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
  materialStockLength,
} from "./quickMaterialEdit";
import { readyForEstimate } from "./takeoffReview";
import { includedScope, workScope } from "./takeoffScope";
import {
  friendlyMaterialName,
  preliminaryDisposition,
  quantityLabel,
  unresolvedMaterials,
} from "./preliminaryMaterials";
import { formatFeet } from "../shared/measurementFormatting";

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
  onAdvanced: (id: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<"summary" | "shopping" | "preliminary">(
    q.analysisReports?.length ? "preliminary" : "summary",
  );
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    if (locked) return;
    const takeoff = prepareMaterialsSummary(q.takeoff, true);
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
  const attention = unresolvedMaterials(q, materials);
  const shown =
    view === "shopping" ? approved : unresolvedOnly ? attention : materials;
  const allPreliminary = purchasingGroups(q, materials);
  const preliminary = allPreliminary
    .filter((g) => !unresolvedOnly || g.quantity === null)
    .sort((a, b) => Number(a.quantity === null) - Number(b.quantity === null));
  const attentionCount =
    view === "preliminary"
      ? allPreliminary.filter((g) => g.quantity === null).length
      : purchasingGroups(q, attention).length;
  const eligible = shown.filter((t) => !summaryApprovalProblem(q, t));
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
  function renderEditableItem(t: TakeoffItem) {
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
            rows={1}
            aria-label={"Material description: " + t.id}
            defaultValue={friendlyMaterialName(t)}
            key={String(t.description) + revision}
            disabled={disabled}
            onBlur={(e) => {
              if (e.target.value !== friendlyMaterialName(t))
                change(t, { description: e.target.value });
            }}
          />
        </td>
        <td data-label="Specifications">
          <textarea
            rows={1}
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
          {t.quantity === null && <small>To confirm</small>}
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="To confirm"
            aria-label={"Quantity: " + t.id}
            defaultValue={t.quantity ?? ""}
            key={String(String(t.quantity)) + revision}
            disabled={disabled}
            onBlur={(e) => {
              const n = e.target.value === "" ? null : Number(e.target.value);
              if (n !== t.quantity) change(t, { quantity: n });
            }}
          />
          {t.quantity !== null && <small>{quantityLabel(q, t)}</small>}
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
        </td>
        <td data-label="Include / Exclude">
          <select
            aria-label={"Include: " + t.id}
            value={includedScope(t) && t.status !== "Rejected" ? "Yes" : "No"}
            disabled={disabled}
            onChange={(e) => change(t, { included: e.target.value === "Yes" })}
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

          {!!problem && !t.convertedLineId && t.status !== "Approved" && (
            <button
              className="button secondary"
              onClick={() => onAdvanced(t.id)}
            >
              Review details
            </button>
          )}
        </td>
      </tr>
    );
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
      <p className="summary-workflow">
        Upload drawing → Preliminary list → Verify missing information → Approve
        → Final list → Send to estimate
      </p>
      <div className="heading-actions">
        <button
          className={"button " + (view === "preliminary" ? "" : "secondary")}
          aria-pressed={view === "preliminary"}
          onClick={() => setView("preliminary")}
        >
          Preliminary Shopping List ({purchasingGroups(q, materials).length})
        </button>
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
      {view !== "shopping" && (
        <nav className="summary-filters" aria-label="Materials table filters">
          <button
            className="button secondary"
            aria-pressed={!unresolvedOnly}
            onClick={() => setUnresolvedOnly(false)}
          >
            All materials ({allPreliminary.length})
          </button>
          <button
            className="button secondary"
            aria-pressed={unresolvedOnly}
            onClick={() => setUnresolvedOnly(true)}
          >
            Needs Attention — {attentionCount} material
            {attentionCount === 1 ? "" : "s"}
          </button>
        </nav>
      )}
      {view === "preliminary" && (
        <p className="preliminary-notice">
          Informational only. Confirm quantities and approve in Materials
          Summary, then send the Final Shopping List to the estimate.
        </p>
      )}
      {view !== "shopping" && (
        <details className="material-reference-section">
          <summary>
            Reference and excluded work (
            {
              q.takeoff.filter(
                (t) => preliminaryDisposition(t, q) === "information",
              ).length
            }
            )
          </summary>
          {q.takeoff
            .filter((t) => preliminaryDisposition(t, q) === "information")
            .map((t) => (
              <div key={t.id} id={"summary-" + t.id}>
                <strong>{t.description}</strong>
                <p>
                  {t.specification} · {workScope(t)}
                  {t.included === false || t.status === "Rejected"
                    ? " · Excluded"
                    : ""}
                </p>
                <p>{t.sourceFacts?.join("; ")}</p>
                <small>
                  Full technical review remains available in Advanced Review.
                </small>
                {t.destination === "Materials" &&
                  (!t.itemRole || t.itemRole === "Construction item") &&
                  workScope(t) !== "Existing work to remain" && (
                    <button
                      className="button secondary"
                      disabled={locked || !!t.convertedLineId}
                      onClick={() => change(t, { included: true })}
                    >
                      Include in quote
                    </button>
                  )}
                <button
                  className="button secondary"
                  onClick={() => onAdvanced(t.id)}
                >
                  Review details
                </button>
              </div>
            ))}
        </details>
      )}
      {view === "summary" && (
        <>
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
      {view === "preliminary" ? (
        <table className="materials-summary-table preliminary-materials">
          <caption className="sr-only">Preliminary Shopping List</caption>
          <thead>
            <tr>
              <th>Material</th>
              <th>Specification</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Status</th>
              <th>Review Details</th>
            </tr>
          </thead>
          <tbody>
            {preliminary.map((group) => {
              const t = group.items[0];
              return (
                <tr
                  key={t.id}
                  id={"summary-" + t.id}
                  data-disposition={
                    group.quantity === null ? "attention" : "material"
                  }
                >
                  <td data-label="Material">
                    <strong>{group.name}</strong>
                    {group.items.slice(1).map((observation) => (
                      <span
                        key={observation.id}
                        id={"summary-" + observation.id}
                      />
                    ))}
                  </td>
                  <td data-label="Specification">
                    <span
                      className="purchasing-specification"
                      title={t.specification || "Specification to confirm"}
                    >
                      {t.specification || "To confirm"}
                    </span>
                    {relevantSpecifications(q, group.items).length > 0 && (
                      <small>Drawing requirements attached</small>
                    )}
                  </td>
                  <td data-label="Quantity">
                    <strong>
                      {group.quantity === null
                        ? "To confirm"
                        : Number(group.quantity.toPrecision(8))}
                    </strong>
                  </td>
                  <td data-label="Unit">
                    {group.quantity === null ? "—" : group.unit}
                    {materialStockLength(t) !== null && (
                      <small>{formatFeet(materialStockLength(t)!)}</small>
                    )}
                  </td>
                  <td data-label="Status">
                    {group.quantity === null
                      ? "Needs review"
                      : readyForEstimate(q, t)
                        ? "Verified"
                        : "Calculated"}
                  </td>
                  <td data-label="Review">
                    <button
                      className="button secondary"
                      onClick={() => onAdvanced(t.id)}
                    >
                      Review details
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : view === "summary" ? (
        <GroupedMaterialsEditor
          quote={q}
          items={shown}
          renderItem={renderEditableItem}
          onReview={onAdvanced}
        />
      ) : (
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
          <tbody>{shown.map(renderEditableItem)}</tbody>
        </table>
      )}
      {!shown.length && (
        <p>
          {view === "shopping"
            ? "Approve verified materials to build your shopping list."
            : unresolvedOnly
              ? "No unresolved materials. Select All materials to continue reviewing."
              : "Analyze drawings or add materials in Advanced Review to begin."}
        </p>
      )}
      {view === "shopping" && <BeamShoppingList quote={q} />}
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
