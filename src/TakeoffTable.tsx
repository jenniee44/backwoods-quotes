import { applyQuickMaterialChanges } from "./quickMaterialEdit";
import QuickMaterialEdit from "./QuickMaterialEdit";
import {
  materialReviewGroup,
  materialNextAction,
} from "./materialReviewPresentation";
import { formatFeet, formatQuantity } from "../shared/measurementFormatting";
import { equivalentComponentKey } from "../shared/componentIdentity";
import {
  overlappingItems,
  unresolvedOverlaps,
  acknowledgeSeparate,
  consolidateCompared,
} from "./takeoffOverlap";
import { useState, useEffect, useRef } from "react";
import type { Quote, TakeoffItem, Kind } from "./model";
import { categories, units, takeoffToLine } from "./model";
import { reviewTakeoff, approveTakeoff, canConvert } from "./planAnalysis";
import {
  requiresScopeVerification,
  materialCategoryFor,
  scopeFor,
  semanticItemKey,
} from "../shared/takeoff";
import {
  materialCategories,
  destinations,
  classifications,
} from "../shared/analysis";
import { calculators, calculateMaterial } from "../shared/materialCalculators";
import type { MaterialCalculation } from "../shared/materialCalculators";
import {
  workScope,
  includedScope,
  unresolvedFoundationAlternative,
} from "./takeoffScope";
import {
  reviewBuckets,
  reviewBucket,
  readyForEstimate,
  type ReviewBucket,
} from "./takeoffReview";
import { consolidateTakeoff } from "./consolidateTakeoff";
import { hasReadableSpecification } from "./takeoffRequirements";
import NumberInput from "./NumberInput";
import { drawingMeasurements } from "../shared/constructionMeasurements";
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
export default function TakeoffTable({
  quote: q,
  locked,
  onChange,
  patch,
  updateItem,
  onError,
  selected,
  setSelected,
}: {
  quote: Quote;
  locked: boolean;
  onChange: (q: Quote) => void;
  patch: (t: TakeoffItem, delta: Partial<TakeoffItem>) => void;
  updateItem: (t: TakeoffItem, action: (t: TakeoffItem) => TakeoffItem) => void;
  onError: (message: string) => void;
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [advanced, setAdvanced] = useState<string[]>([]);
  const [editing, setEditing] = useState<string[]>([]);
  const [filter, setFilter] = useState<ReviewBucket | null>(null);
  useEffect(() => {
    if (locked) return;
    const consolidated = consolidateTakeoff(q.takeoff, true);
    if (consolidated.length !== q.takeoff.length)
      onChange({ ...q, takeoff: consolidated });
  }, [q, locked, onChange]);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const added = q.takeoff.filter(
      (t) => !seen.current.has(t.id) && !t.origin && !t.description,
    );
    q.takeoff.forEach((t) => seen.current.add(t.id));
    if (added.length)
      setEditing((ids) => [...new Set([...ids, ...added.map((t) => t.id)])]);
  }, [q.takeoff]);
  const groupFor = (t: TakeoffItem) => materialReviewGroup(q, t);
  const matchesFilter = (t: TakeoffItem, bucket: ReviewBucket) =>
    reviewBucket(q, t) === bucket &&
    (bucket !== "Ready for review" ||
      (!t.convertedLineId && t.status !== "Approved"));
  const shown = q.takeoff.filter(
    (t) => !filter || matchesFilter(t, filter) || editing.includes(t.id),
  );
  const groups = [...new Set(shown.map(groupFor))];
  const eligible = q.takeoff.filter((t) => readyForEstimate(q, t));
  const missingFor = (t: TakeoffItem) => [
    ...(unresolvedFoundationAlternative(q, t)
      ? ["Foundation alternative assembly and method"]
      : []),
    ...(t.calculation
      ? calculateMaterial(t.calculation).missing
      : t.quantity === null
        ? [
            t.destination === "Labour"
              ? "Verified labour hours"
              : "Verified quantity",
          ]
        : []),
    ...(t.destination === "Materials" && !t.specification?.trim()
      ? ["Material specification / selected product"]
      : []),
    ...(!includedScope(t) ? ["Contract scope inclusion"] : []),
    ...(requiresScopeVerification(t) && !t.scopeVerified
      ? ["Existing/new/by-others verification"]
      : []),
  ];
  const calculate = (t: TakeoffItem, recipe: MaterialCalculation) => {
    const result = calculateMaterial(recipe);
    patch(t, {
      calculation: recipe,
      ...(calculators
        .find((c) => c.kind === recipe.kind)
        ?.fields.some((f) => f.key === "stock")
        ? { stockLength: recipe.inputs.stock ?? null }
        : {}),
      quantity: result.quantity,
      unit: result.unit || t.unit,
      classification:
        result.quantity === null
          ? "Contractor input required"
          : "Calculated quantity",
      quantityMethod: result.quantity === null ? "Unknown" : "Calculated",
      calculationBasis: `${result.formula}; ${Object.entries(recipe.inputs)
        .map(([key, value]) => `${key}=${value ?? "missing"}`)
        .join(", ")}`,
    });
  };
  const potentialAlternatives =
    q.takeoff.some((t) => /concrete|footing/i.test(t.description)) &&
    q.takeoff.some((t) => /helical|screw pile/i.test(t.description));
  return (
    <>
      <p className="tiny">
        Check each material, then approve. Open View details for drawing
        evidence or calculations.
      </p>
      {potentialAlternatives && (
        <p className="info">
          Concrete footings and helical piles appear in this takeoff. If they
          are alternatives for the same assembly, assign the same alternative
          group and different methods below. Mixed foundation designs must be
          verified; no alternative is automatically chosen.
        </p>
      )}
      {!!q.takeoff.length && (
        <nav className="review-summary" aria-label="Material review summary">
          <button
            className={`review-filter ${filter === null ? "active" : ""}`}
            onClick={() => {
              setEditing([]);
              setFilter(null);
            }}
            aria-pressed={filter === null}
          >
            All items <b>{q.takeoff.length}</b>
          </button>
          {reviewBuckets.map((bucket) => (
            <button
              key={bucket}
              className={`review-filter ${filter === bucket ? "active" : ""}`}
              aria-pressed={filter === bucket}
              onClick={() => {
                setEditing([]);
                setFilter(filter === bucket ? null : bucket);
              }}
            >
              {bucket}{" "}
              <b>{q.takeoff.filter((t) => matchesFilter(t, bucket)).length}</b>
            </button>
          ))}
        </nav>
      )}
      {filter && (
        <p className="tiny">
          Showing {filter.toLowerCase()}.{" "}
          <button
            className="button secondary"
            onClick={() => {
              setEditing([]);
              setFilter(null);
            }}
          >
            Show all materials
          </button>
        </p>
      )}
      {filter && !shown.length && <p>No items in this group.</p>}
      {eligible.length > 0 && (
        <section
          className="estimate-review-summary"
          aria-label="Reviewed estimate summary"
        >
          <h4>
            {eligible.length} approved{" "}
            {eligible.length === 1 ? "item" : "items"} ready for estimate
          </h4>
          <details>
            <summary>Review approved material list</summary>
            <ul>
              {eligible.map((t) => (
                <li key={t.id}>
                  {t.description} — {formatQuantity(t.quantity!, t.unit)} ·{" "}
                  {t.specification} · {t.destination ?? "Materials"}
                </li>
              ))}
            </ul>
          </details>
          <p className="tiny">
            Quantities are reviewed purchase/estimate quantities. Costs and
            labour rates remain for you to enter.
          </p>
          <button
            className="button"
            disabled={locked}
            onClick={() => {
              if (
                !window.confirm(
                  `Add ${eligible.length} approved items to the estimate? Existing manual lines will be preserved. No prices or labour rates will be filled in.`,
                )
              )
                return;
              try {
                let next = q;
                for (const t of eligible)
                  next = takeoffToLine(
                    next,
                    t,
                    (t.destination === "Subcontractor"
                      ? "Other Costs"
                      : (t.destination ?? "Materials")) as Kind,
                  );
                onChange(next);
              } catch (error) {
                onError((error as Error).message);
              }
            }}
          >
            Add approved items to estimate
          </button>
        </section>
      )}
      <datalist id="takeoff-units">
        {units.map((unit) => (
          <option key={unit}>{unit}</option>
        ))}
      </datalist>
      {groups.map((group) => (
        <section className="takeoff-group" key={group}>
          <h3>
            {group}{" "}
            <span className="tiny">
              ({shown.filter((t) => groupFor(t) === group).length})
            </span>
          </h3>
          <div className="takeoff-table-scroll">
            <table className="takeoff-table" aria-label={`${group} takeoff`}>
              <thead>
                <tr>
                  {[
                    "Description",
                    "Specifications",
                    "Quantity",
                    "Unit",
                    "Confidence",
                    "Review status",
                    "Actions",
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              {shown
                .filter((t) => groupFor(t) === group)
                .map((t) => {
                  const disabled = locked || !!t.convertedLineId;
                  const recipe = t.calculation;
                  const definition = calculators.find(
                    (d) => d.kind === recipe?.kind,
                  );
                  const preview = recipe
                    ? calculateMaterial(recipe, false)
                    : null;
                  return (
                    <tbody
                      className="line-card"
                      key={t.id}
                      id={`takeoff-${t.id}`}
                    >
                      <tr className="takeoff-summary-row">
                        <td colSpan={7}>
                          <div className="material-card-heading">
                            <div>
                              <strong>{t.description || "New material"}</strong>
                              <span>
                                {hasReadableSpecification(t)
                                  ? t.specification
                                  : "Specification needed"}
                              </span>
                            </div>
                            <div className="material-card-quantity">
                              <strong>
                                {t.quantity === null
                                  ? "Quantity needed"
                                  : formatQuantity(t.quantity, t.unit)}
                              </strong>
                              <span>
                                {t.convertedLineId
                                  ? "Added to estimate"
                                  : t.status === "Approved"
                                    ? "Approved"
                                    : reviewBucket(q, t) ===
                                        "Excluded or informational"
                                      ? "Excluded"
                                      : t.reviewAcknowledged
                                        ? "Verified quantity"
                                        : t.origin === "ai"
                                          ? "Proposed quantity"
                                          : "Ready for review"}
                              </span>
                            </div>
                          </div>
                          {materialNextAction(q, t) && (
                            <p className="tiny material-next-action">
                              {materialNextAction(q, t)}
                            </p>
                          )}
                          <div className="takeoff-main-actions">
                            <button
                              className="button secondary"
                              disabled={disabled}
                              aria-expanded={editing.includes(t.id)}
                              onClick={() => {
                                if (!editing.includes(t.id)) {
                                  setExpanded((ids) =>
                                    ids.filter((id) => id !== t.id),
                                  );
                                  setAdvanced((ids) =>
                                    ids.filter((id) => id !== t.id),
                                  );
                                }
                                setEditing((ids) =>
                                  ids.includes(t.id)
                                    ? ids.filter((id) => id !== t.id)
                                    : [...ids, t.id],
                                );
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="button"
                              aria-label="Approve material"
                              disabled={
                                disabled ||
                                editing.includes(t.id) ||
                                t.status === "Approved" ||
                                reviewBucket(q, t) !== "Ready for review"
                              }
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Approve ${t.description}? I verified the specification, quantity/unit, scope and source evidence, including any critical measurements. This is a purchase/estimate quantity, not an unverified drawing count.`,
                                  )
                                )
                                  updateItem(t, (item) =>
                                    approveTakeoff(reviewTakeoff(item)),
                                  );
                              }}
                            >
                              Approve
                            </button>
                            <button
                              className="button secondary"
                              disabled={
                                disabled ||
                                editing.includes(t.id) ||
                                t.status === "Rejected"
                              }
                              onClick={() =>
                                updateItem(t, (item) => ({
                                  ...item,
                                  status: "Rejected",
                                  reviewAcknowledged: false,
                                }))
                              }
                            >
                              Exclude
                            </button>
                          </div>
                          {editing.includes(t.id) && (
                            <QuickMaterialEdit
                              item={t}
                              disabled={disabled}
                              onSave={(delta) =>
                                updateItem(t, (item) =>
                                  applyQuickMaterialChanges(item, delta),
                                )
                              }
                              onClose={() =>
                                setEditing((ids) =>
                                  ids.filter((id) => id !== t.id),
                                )
                              }
                              onAdvanced={() => {
                                setEditing((ids) =>
                                  ids.filter((id) => id !== t.id),
                                );
                                setExpanded((ids) => [
                                  ...new Set([...ids, t.id]),
                                ]);
                                setAdvanced((ids) => [
                                  ...new Set([...ids, t.id]),
                                ]);
                              }}
                            />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={7}>
                          <details
                            className="takeoff-evidence"
                            open={expanded.includes(t.id)}
                          >
                            <summary
                              onClick={(e) => {
                                e.preventDefault();
                                setEditing((ids) =>
                                  ids.filter((id) => id !== t.id),
                                );
                                setExpanded((ids) =>
                                  ids.includes(t.id)
                                    ? ids.filter((id) => id !== t.id)
                                    : [...ids, t.id],
                                );
                              }}
                            >
                              View details
                            </summary>
                            {!!overlappingItems(q, t).length && (
                              <section className="overlap-comparison">
                                <h4>Review possible duplicates</h4>
                                <p className="tiny">
                                  Match specification, location and method.
                                  Quantities are never added.
                                </p>
                                {overlappingItems(q, t).map((peer) => (
                                  <article key={peer.id}>
                                    <b>
                                      Possible duplicate:{" "}
                                      {peer.specification || peer.description}
                                    </b>
                                    {t.quantity !== null &&
                                      peer.quantity !== null &&
                                      t.quantity !== peer.quantity &&
                                      t.unit === peer.unit && (
                                        <p className="info">
                                          Conflicting counts: {t.quantity}{" "}
                                          versus {peer.quantity} {t.unit}.
                                          Verify against the drawing; never add
                                          the counts.
                                        </p>
                                      )}
                                    <p>
                                      {peer.specification ||
                                        "Specification unknown"}{" "}
                                      · {peer.location || "Location unknown"} ·{" "}
                                      {peer.quantity ?? "Unknown"} {peer.unit} ·{" "}
                                      {workScope(peer)} ·{" "}
                                      {peer.alternativeOption ||
                                        "Method unspecified"}
                                    </p>
                                    <details>
                                      <summary>View evidence</summary>
                                      <p>
                                        This item: {t.documentId || "manual"},
                                        page {t.page ?? "unknown"};{" "}
                                        {t.sourceFacts?.join("; ")} {t.notes}
                                        <br />
                                        Other item:{" "}
                                        {peer.documentId || "manual"}, page{" "}
                                        {peer.page ?? "unknown"};{" "}
                                        {peer.sourceFacts?.join("; ")}{" "}
                                        {peer.notes}
                                      </p>
                                    </details>
                                    <button
                                      className="button secondary"
                                      disabled={locked || !!t.convertedLineId}
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            "I verified these represent separate assemblies, locations or work scopes. Keep both records?",
                                          )
                                        )
                                          onChange(
                                            acknowledgeSeparate(q, t, peer),
                                          );
                                      }}
                                    >
                                      Keep separate
                                    </button>
                                    <button
                                      className="button secondary"
                                      disabled={
                                        locked ||
                                        !!t.convertedLineId ||
                                        !!peer.convertedLineId
                                      }
                                      onClick={() => {
                                        if (
                                          window.confirm(
                                            "Consolidate this matching material without adding quantities? The other item is retained as rejected source evidence. Review and approve the retained item again.",
                                          )
                                        ) {
                                          try {
                                            onChange(
                                              consolidateCompared(q, t, peer),
                                            );
                                          } catch (error) {
                                            onError((error as Error).message);
                                          }
                                        }
                                      }}
                                    >
                                      Combine matching materials
                                    </button>
                                  </article>
                                ))}
                              </section>
                            )}

                            <details
                              className="takeoff-advanced"
                              open={advanced.includes(t.id)}
                            >
                              <summary
                                onClick={(e) => {
                                  e.preventDefault();
                                  setAdvanced((ids) =>
                                    ids.includes(t.id)
                                      ? ids.filter((id) => id !== t.id)
                                      : [...ids, t.id],
                                  );
                                }}
                              >
                                Advanced details
                              </summary>
                              <p className="tiny">
                                {t.classification ?? "Contractor entry"} ·{" "}
                                {t.sourceDocumentName || "Manual source"} ·
                                Source page {t.page ?? "unknown"}, detail{" "}
                                {t.sourceDetailView ?? "original"} ·{" "}
                                {workScope(t)} · Quantity basis:{" "}
                                {t.quantityMethod ?? "Contractor entry"}
                              </p>
                              <p className="tiny">
                                {t.confidence} confidence · {t.classification} ·
                                Support basis:{" "}
                                {t.supportBasis ?? "Not established"} · Quantity
                                basis: {t.quantityMethod ?? "Contractor entry"}
                              </p>
                              {t.specification && (
                                <p>Written specification: {t.specification}</p>
                              )}
                              {!!t.sourceFacts?.length && (
                                <p>
                                  <b>Extracted drawing facts:</b>{" "}
                                  {t.sourceFacts.join("; ")}
                                </p>
                              )}
                              {!!drawingMeasurements(t).length && (
                                <details>
                                  <summary>
                                    Written measurements — verify before using
                                  </summary>
                                  <ul>
                                    {drawingMeasurements(t).map(
                                      (measurement, index) => (
                                        <li key={index}>
                                          <b>{measurement.written}</b> (
                                          {formatFeet(measurement.inches / 12)})
                                          · {measurement.confidence} confidence
                                          · source {measurement.documentId},
                                          page {measurement.page ?? "unknown"},
                                          detail{" "}
                                          {measurement.detail ?? "original"}.
                                          <br />
                                          {measurement.fact}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                  <p className="tiny">
                                    Transcribed drawing observations, not
                                    verified inputs. Confirm location, units and
                                    layout before entering calculator values.
                                    Nominal lumber sizes are not actual board
                                    coverage.
                                  </p>
                                </details>
                              )}
                              {!!t.warnings?.length && (
                                <p>
                                  All verification notes:{" "}
                                  {t.warnings.join("; ")}
                                </p>
                              )}
                              {!!t.assumptions?.length && (
                                <p>Assumptions: {t.assumptions.join("; ")}</p>
                              )}
                              {(q.analysisReports ?? [])
                                .flatMap(
                                  (report) => report.duplicateEvidence ?? [],
                                )
                                .filter(
                                  (evidence) =>
                                    semanticItemKey(evidence) ===
                                      semanticItemKey(t) ||
                                    (!!equivalentComponentKey(
                                      t,
                                      materialCategoryFor(t),
                                    ) &&
                                      equivalentComponentKey(
                                        evidence,
                                        materialCategoryFor(evidence),
                                      ) ===
                                        equivalentComponentKey(
                                          t,
                                          materialCategoryFor(t),
                                        )),
                                )
                                .map((evidence, index) => (
                                  <p key={index} className="tiny">
                                    Additional duplicate source:{" "}
                                    {evidence.documentId}, page{" "}
                                    {evidence.page ?? "unknown"}, detail{" "}
                                    {evidence.sourceDetailView ?? "original"}.{" "}
                                    {evidence.sourceFacts?.join("; ")}{" "}
                                    {evidence.notes}
                                  </p>
                                ))}
                              {t.calculationBasis && (
                                <p>Calculation basis: {t.calculationBasis}</p>
                              )}
                              <fieldset disabled={disabled}>
                                <p className="tiny">
                                  <b>1. Drawing facts & specifications</b> —
                                  Existing extracted information is shown below;
                                  do not re-enter it. Verify it against the
                                  source.
                                </p>
                                <table className="takeoff-edit-table">
                                  <tbody>
                                    {" "}
                                    <tr>
                                      <td data-label="Material description">
                                        <input
                                          aria-label="Takeoff description"
                                          disabled={disabled}
                                          value={t.description}
                                          onChange={(e) =>
                                            patch(t, {
                                              description: e.target.value,
                                            })
                                          }
                                        />
                                        <p className="tiny">
                                          {t.classification ??
                                            "Contractor entry"}{" "}
                                          ·{" "}
                                          {t.sourceDocumentName ||
                                            "Manual source"}
                                          {t.page ? ` — Page ${t.page}` : ""}
                                          {t.sourceDetailView
                                            ? ` · Detail view ${t.sourceDetailView}`
                                            : ""}
                                        </p>
                                        {requiresScopeVerification(t) &&
                                          !t.convertedLineId && (
                                            <label className="takeoff-scope-check">
                                              <input
                                                type="checkbox"
                                                disabled={locked}
                                                checked={!!t.scopeVerified}
                                                onChange={(e) =>
                                                  patch(t, {
                                                    scopeVerified:
                                                      e.target.checked,
                                                  })
                                                }
                                              />
                                              I verified existing/new/by-others
                                              status and this item is included
                                              in our contract scope.
                                            </label>
                                          )}
                                      </td>
                                      <td data-label="Written specification">
                                        <input
                                          aria-label="Written specification"
                                          disabled={disabled}
                                          value={t.specification ?? ""}
                                          placeholder="Requires contractor input"
                                          onChange={(e) =>
                                            patch(t, {
                                              specification: e.target.value,
                                            })
                                          }
                                        />
                                      </td>
                                      <td data-label="Verified quantity">
                                        <Field label="Takeoff quantity">
                                          <NumberInput
                                            value={t.quantity}
                                            nullable
                                            disabled={disabled}
                                            placeholder="Requires contractor input"
                                            onChange={(n) =>
                                              patch(t, {
                                                quantity: Number.isNaN(n)
                                                  ? null
                                                  : n,
                                                classification: Number.isNaN(n)
                                                  ? "Contractor input required"
                                                  : "Estimating suggestion",
                                                quantityMethod: "Unknown",
                                                calculationBasis: "",
                                                calculation: undefined,
                                              })
                                            }
                                          />
                                        </Field>
                                        {t.quantity === null && (
                                          <small>
                                            Requires contractor input —{" "}
                                            {t.destination === "Labour"
                                              ? "enter verified labour hours; no hours were invented."
                                              : "verify quantity; no quantity was invented."}
                                          </small>
                                        )}
                                      </td>
                                      <td data-label="Quantity unit">
                                        <input
                                          aria-label="Takeoff unit"
                                          list="takeoff-units"
                                          disabled={disabled}
                                          value={t.unit}
                                          onChange={(e) =>
                                            patch(t, {
                                              unit: e.target.value,
                                              classification:
                                                "Estimating suggestion",
                                              quantityMethod: "Unknown",
                                              calculationBasis: "",
                                              calculation: undefined,
                                            })
                                          }
                                        />
                                      </td>
                                      <td data-label="Confidence">
                                        <select
                                          aria-label="Confidence"
                                          disabled={disabled}
                                          value={t.confidence}
                                          onChange={(e) =>
                                            patch(t, {
                                              confidence: e.target
                                                .value as TakeoffItem["confidence"],
                                            })
                                          }
                                        >
                                          {[
                                            "Unspecified",
                                            "Low",
                                            "Medium",
                                            "High",
                                          ].map((value) => (
                                            <option key={value}>{value}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td data-label="Review status">
                                        <select
                                          aria-label="Review status"
                                          disabled={disabled}
                                          value={t.status}
                                          onChange={(e) =>
                                            updateItem(t, (item) =>
                                              e.target.value === "Reviewed"
                                                ? reviewTakeoff(item)
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
                                          <option>Approved</option>
                                          <option>Rejected</option>
                                        </select>
                                        {!t.convertedLineId && (
                                          <label className="takeoff-scope-check">
                                            <input
                                              type="checkbox"
                                              disabled={locked}
                                              checked={selected.includes(t.id)}
                                              onChange={(e) =>
                                                setSelected((ids) =>
                                                  e.target.checked
                                                    ? [...ids, t.id]
                                                    : ids.filter(
                                                        (id) => id !== t.id,
                                                      ),
                                                )
                                              }
                                            />
                                            Select for approval
                                          </label>
                                        )}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                                {t.warnings?.some((w) =>
                                  /conflicting/i.test(w),
                                ) && (
                                  <label className="check-options">
                                    <input
                                      type="checkbox"
                                      checked={!!t.conflictsVerified}
                                      onChange={(e) =>
                                        patch(t, {
                                          conflictsVerified: e.target.checked,
                                        })
                                      }
                                    />
                                    I reconciled the conflicting observations
                                    against the drawing and verified this
                                    quantity, specification and assembly.
                                    Original observations are preserved.
                                  </label>
                                )}
                                <div className="fields compact">
                                  <Field label="Work scope">
                                    <select
                                      value={workScope(t)}
                                      onChange={(e) =>
                                        patch(t, {
                                          workScope: e.target
                                            .value as TakeoffItem["workScope"],
                                          included:
                                            e.target.value === "New work",
                                          scopeVerified: false,
                                        })
                                      }
                                    >
                                      {[
                                        "New work",
                                        "Existing work to remain",
                                        "Existing work to remove or modify",
                                        "By others / excluded",
                                        "Requires scope confirmation",
                                        ...(t.workScope === "Existing work" ||
                                        t.workScope === "By others"
                                          ? [t.workScope]
                                          : []),
                                      ].map((value) => (
                                        <option key={value}>{value}</option>
                                      ))}
                                    </select>
                                  </Field>
                                  <label className="check-options">
                                    <input
                                      type="checkbox"
                                      checked={includedScope(t)}
                                      disabled={[
                                        "Existing work to remain",
                                        "Requires scope confirmation",
                                      ].includes(workScope(t))}
                                      onChange={(e) =>
                                        patch(t, {
                                          included: e.target.checked,
                                          scopeVerified: e.target.checked,
                                        })
                                      }
                                    />
                                    Explicitly include this work in our contract
                                  </label>
                                  <Field label="Alternative assembly group">
                                    <input
                                      maxLength={200}
                                      value={t.alternativeGroup ?? ""}
                                      placeholder="e.g. Rear deck foundations"
                                      onChange={(e) =>
                                        patch(t, {
                                          alternativeGroup: e.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field label="Alternative construction method">
                                    <input
                                      maxLength={200}
                                      list="foundation-methods"
                                      value={t.alternativeOption ?? ""}
                                      placeholder="e.g. Concrete footings"
                                      onChange={(e) =>
                                        patch(t, {
                                          alternativeOption: e.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                </div>
                                {t.origin === "ai" &&
                                  t.destination === "Materials" &&
                                  (t.category === "Beams" ||
                                    /\bbeams?\b/i.test(t.description)) &&
                                  !t.calculation && (
                                    <label className="check-options">
                                      <input
                                        type="checkbox"
                                        checked={!!t.purchaseVerified}
                                        onChange={(e) =>
                                          patch(t, {
                                            purchaseVerified: e.target.checked,
                                          })
                                        }
                                      />
                                      I verified beam purchase quantities,
                                      lengths, plies, stock and approved
                                      cut/splice layout. Run counts are not
                                      purchase boards.
                                    </label>
                                  )}
                                <div className="material-calculator">
                                  <h4>
                                    2. Verified measurements & calculated
                                    quantity
                                  </h4>
                                  <p className="tiny">
                                    Extracted specifications and source facts
                                    remain above. Calculator fields require
                                    verified values; missing dimensions, stock
                                    choices and waste stay contractor input
                                    required.
                                  </p>
                                  <Field label="Material calculator">
                                    <select
                                      value={recipe?.kind ?? ""}
                                      disabled={
                                        t.destination === "Labour" ||
                                        t.destination === "Subcontractor" ||
                                        t.destination === "Other Costs"
                                      }
                                      onChange={(e) =>
                                        e.target.value
                                          ? calculate(t, {
                                              kind: e.target.value,
                                              inputs: {},
                                              verified: false,
                                            })
                                          : patch(t, {
                                              calculation: undefined,
                                              quantity: null,
                                              quantityMethod: "Unknown",
                                            })
                                      }
                                    >
                                      <option value="">
                                        Manual verified quantity
                                      </option>
                                      {calculators.map((c) => (
                                        <option key={c.kind} value={c.kind}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                  </Field>
                                  {recipe && definition && (
                                    <>
                                      <p>
                                        <b>Formula:</b> {definition.formula}
                                      </p>
                                      <div className="fields compact">
                                        {definition.fields.map((field) => (
                                          <div key={field.key}>
                                            <Field label={field.label}>
                                              {field.options ? (
                                                <select
                                                  aria-label={field.label}
                                                  value={
                                                    recipe.inputs[field.key] ??
                                                    ""
                                                  }
                                                  onChange={(e) =>
                                                    calculate(t, {
                                                      ...recipe,
                                                      verified: false,
                                                      inputs: {
                                                        ...recipe.inputs,
                                                        [field.key]:
                                                          e.target.value === ""
                                                            ? null
                                                            : Number(
                                                                e.target.value,
                                                              ),
                                                      },
                                                    })
                                                  }
                                                >
                                                  <option value="">
                                                    Choose direction
                                                  </option>
                                                  {field.options.map(
                                                    (option) => (
                                                      <option
                                                        key={option.value}
                                                        value={option.value}
                                                      >
                                                        {option.label}
                                                      </option>
                                                    ),
                                                  )}
                                                </select>
                                              ) : (
                                                <NumberInput
                                                  nullable
                                                  value={
                                                    recipe.inputs[field.key] ??
                                                    null
                                                  }
                                                  step={
                                                    field.integer ? "1" : "any"
                                                  }
                                                  onChange={(value) =>
                                                    calculate(t, {
                                                      ...recipe,
                                                      verified: false,
                                                      inputs: {
                                                        ...recipe.inputs,
                                                        [field.key]:
                                                          Number.isNaN(value)
                                                            ? null
                                                            : value,
                                                      },
                                                    })
                                                  }
                                                />
                                              )}
                                            </Field>
                                            {field.label.includes("(ft)") &&
                                              recipe.inputs[field.key] !=
                                                null && (
                                                <p className="tiny">
                                                  {formatFeet(
                                                    recipe.inputs[field.key]!,
                                                  )}
                                                </p>
                                              )}
                                            {/\((?:ft|in)\)/.test(
                                              field.label,
                                            ) &&
                                              !!drawingMeasurements(t)
                                                .length && (
                                                <label className="field">
                                                  <span>
                                                    Use written measurement for{" "}
                                                    {field.label}
                                                  </span>
                                                  <select
                                                    aria-label={`Use written measurement for ${field.label}`}
                                                    value=""
                                                    onChange={(e) => {
                                                      if (!e.target.value)
                                                        return;
                                                      const m =
                                                        drawingMeasurements(t)[
                                                          Number(
                                                            e.target.value,
                                                          ) - 1
                                                        ];
                                                      if (!m) return;
                                                      calculate(t, {
                                                        ...recipe,
                                                        verified: false,
                                                        inputs: {
                                                          ...recipe.inputs,
                                                          [field.key]:
                                                            field.label.includes(
                                                              "(ft)",
                                                            )
                                                              ? m.inches / 12
                                                              : m.inches,
                                                        },
                                                      });
                                                    }}
                                                  >
                                                    <option value="">
                                                      Choose a source
                                                      observation — verify its
                                                      role
                                                    </option>
                                                    {drawingMeasurements(t).map(
                                                      (m, index) => (
                                                        <option
                                                          key={index}
                                                          value={index + 1}
                                                        >
                                                          {m.written} · {m.fact}{" "}
                                                          · page{" "}
                                                          {m.page ?? "unknown"}{" "}
                                                          · {m.confidence}
                                                        </option>
                                                      ),
                                                    )}
                                                  </select>
                                                </label>
                                              )}
                                          </div>
                                        ))}
                                      </div>
                                      <p className="tiny">
                                        {recipe.kind === "decking-layout"
                                          ? "Rectangular section only; each row uses the approved number of equal-length pieces. Confirm joints, supports, end gaps and trimming. Calculate irregular sections separately; do not subtract openings that do not remove entire rows. Stock offcuts are reused within this section only."
                                          : [
                                                "post-stock",
                                                "ledger",
                                                "rim-joist",
                                                "blocking",
                                                "fascia",
                                                "stair-riser",
                                              ].includes(recipe.kind)
                                            ? "Equal cut lengths within one run/section only. Kerf is included between cuts. No structural splice or offcut reuse between different sections is assumed."
                                            : "Verify shape, openings, edge conditions and construction specifications. Calculate different sections or member lengths separately."}
                                      </p>
                                      <label className="check-options">
                                        <input
                                          type="checkbox"
                                          checked={recipe.verified}
                                          onChange={(e) =>
                                            calculate(t, {
                                              ...recipe,
                                              verified: e.target.checked,
                                            })
                                          }
                                        />
                                        I verified all calculator inputs,
                                        selected materials, cut layout and
                                        specifications.
                                      </label>
                                      <p className="tiny">
                                        {preview?.quantity !== null
                                          ? `Calculated preview: ${preview?.quantity} ${preview?.unit}.`
                                          : preview?.missing.join(" · ")}{" "}
                                        {recipe.verified
                                          ? "Review and approve before conversion."
                                          : "Requires contractor verification before use."}
                                      </p>
                                      {!!preview?.steps?.length && (
                                        <ul className="tiny">
                                          {preview.steps.map((step) => (
                                            <li key={step}>{step}</li>
                                          ))}
                                        </ul>
                                      )}
                                      <p className="tiny">
                                        Counts and purchase allowances only: no
                                        span, connection, stair-code, footing
                                        design or splice engineering is
                                        inferred. Openings, support layout and
                                        product coverage must be verified. Edit
                                        quantity directly to leave the
                                        calculator and enter a manual count.
                                      </p>
                                    </>
                                  )}
                                </div>
                                <div className="fields compact">
                                  <Field label="Source document">
                                    <select
                                      value={t.documentId}
                                      onChange={(e) =>
                                        patch(t, { documentId: e.target.value })
                                      }
                                    >
                                      <option value="">
                                        Manual / no attached document
                                      </option>
                                      {t.documentId &&
                                        !q.documents.some(
                                          (d) => d.id === t.documentId,
                                        ) && (
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
                                        patch(t, {
                                          page: Number.isNaN(n) ? null : n,
                                        })
                                      }
                                    />
                                  </Field>
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
                                  <Field label="Suggested destination">
                                    <select
                                      value={t.destination ?? "Materials"}
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
                                      value={t.category ?? "Miscellaneous"}
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
                                      value={
                                        t.classification ??
                                        "Estimating suggestion"
                                      }
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
                                  <Field label="Calculation basis">
                                    <textarea
                                      value={t.calculationBasis ?? ""}
                                      onChange={(e) =>
                                        patch(t, {
                                          calculationBasis: e.target.value,
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field label="Takeoff notes / source reference">
                                    <textarea
                                      value={t.notes}
                                      onChange={(e) =>
                                        patch(t, { notes: e.target.value })
                                      }
                                    />
                                  </Field>
                                </div>
                                {missingFor(t).length > 0 && (
                                  <section className="info">
                                    <h4>Contractor input still required</h4>
                                    <p>{missingFor(t).join(" · ")}</p>
                                  </section>
                                )}
                                <h4>
                                  3. Verify review, approve & add to estimate
                                </h4>
                                <table className="takeoff-edit-table">
                                  <tbody>
                                    <tr>
                                      <td data-label="3. Review, approve & add to estimate">
                                        <div className="takeoff-row-actions">
                                          {!t.convertedLineId ? (
                                            <>
                                              <button
                                                disabled={locked}
                                                className="button secondary"
                                                aria-label="Mark reviewed — I verified this item"
                                                onClick={() =>
                                                  updateItem(t, reviewTakeoff)
                                                }
                                              >
                                                Review
                                              </button>
                                              <button
                                                disabled={
                                                  locked ||
                                                  t.status !== "Reviewed" ||
                                                  !t.reviewAcknowledged ||
                                                  !!unresolvedOverlaps(q, t)
                                                    .length
                                                }
                                                className="button"
                                                aria-label="Approve item"
                                                onClick={() =>
                                                  updateItem(t, approveTakeoff)
                                                }
                                              >
                                                Approve
                                              </button>
                                              <button
                                                disabled={locked}
                                                className="button secondary"
                                                aria-label="Reject item"
                                                onClick={() =>
                                                  updateItem(t, (item) => ({
                                                    ...item,
                                                    status: "Rejected",
                                                    reviewAcknowledged: false,
                                                  }))
                                                }
                                              >
                                                Reject
                                              </button>
                                              <select
                                                aria-label="Convert reviewed item to estimate"
                                                value=""
                                                disabled={
                                                  locked ||
                                                  !canConvert(t) ||
                                                  !!unresolvedOverlaps(q, t)
                                                    .length ||
                                                  !t.description.trim()
                                                }
                                                onChange={(e) => {
                                                  try {
                                                    onChange(
                                                      takeoffToLine(
                                                        q,
                                                        t,
                                                        e.target.value as Kind,
                                                      ),
                                                    );
                                                  } catch (error) {
                                                    onError(
                                                      (error as Error).message,
                                                    );
                                                  }
                                                }}
                                              >
                                                <option value="">
                                                  Add to estimate…
                                                </option>
                                                {(t.origin === "ai"
                                                  ? [
                                                      t.destination ===
                                                      "Subcontractor"
                                                        ? "Other Costs"
                                                        : t.destination,
                                                    ].filter(
                                                      (kind) =>
                                                        kind &&
                                                        kind !==
                                                          "Informational",
                                                    )
                                                  : [
                                                      "Materials",
                                                      "Labour",
                                                      "Other Costs",
                                                    ]
                                                ).map((kind) => (
                                                  <option key={kind}>
                                                    {kind}
                                                  </option>
                                                ))}
                                              </select>
                                              <button
                                                disabled={locked}
                                                className="button secondary danger"
                                                aria-label={`Remove takeoff ${t.description || "item"}`}
                                                onClick={() =>
                                                  onChange({
                                                    ...q,
                                                    takeoff: q.takeoff.filter(
                                                      (item) =>
                                                        item.id !== t.id,
                                                    ),
                                                  })
                                                }
                                              >
                                                Remove
                                              </button>
                                            </>
                                          ) : (
                                            <span className="tiny">
                                              Converted to an estimate line.
                                              Review that line separately.
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </fieldset>
                            </details>
                          </details>
                        </td>
                      </tr>
                    </tbody>
                  );
                })}
            </table>
          </div>
        </section>
      ))}
      <datalist id="foundation-methods">
        <option>Concrete footings</option>
        <option>Helical piles</option>
      </datalist>
    </>
  );
}
