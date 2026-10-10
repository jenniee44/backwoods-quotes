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
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const added = q.takeoff.filter(
      (t) => !seen.current.has(t.id) && !t.origin && !t.description,
    );
    q.takeoff.forEach((t) => seen.current.add(t.id));
    if (added.length)
      setExpanded((ids) => [...new Set([...ids, ...added.map((t) => t.id)])]);
  }, [q.takeoff]);
  const groupFor = (t: TakeoffItem) =>
    t.destination === "Materials" &&
    t.category &&
    t.category !== "Miscellaneous"
      ? t.category
      : scopeFor(t);
  const groups = [...new Set(q.takeoff.map(groupFor))];
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
  const recommended = (t: TakeoffItem) =>
    (
      ({
        Posts: "posts",
        Beams: "beams",
        Joists: "joists",
        Decking: "decking-layout",
        "Guards / railings": "railing",
      }) as Record<string, string>
    )[t.category ?? ""];
  const missing = q.takeoff.filter(
    (t) =>
      !t.convertedLineId && t.status !== "Rejected" && missingFor(t).length,
  );
  const calculate = (t: TakeoffItem, recipe: MaterialCalculation) => {
    const result = calculateMaterial(recipe);
    patch(t, {
      calculation: recipe,
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
      <p className="info">
        Review material → Verify specifications and measurements → Calculate
        quantity → Approve → Add to estimate. Drawing facts are retained; verify
        critical measurements before using calculated quantities.
      </p>
      {potentialAlternatives && (
        <p className="info">
          Concrete footings and helical piles appear in this takeoff. If they
          are alternatives for the same assembly, assign the same alternative
          group and different methods below. Mixed foundation designs must be
          verified; no alternative is automatically chosen.
        </p>
      )}
      {!!missing.length && (
        <details className="missing-information">
          <summary>
            Missing information checklist ({missing.length} items)
          </summary>
          <ul>
            {missing.map((t) => (
              <li key={t.id}>
                <button
                  className="button secondary"
                  disabled={locked}
                  onClick={() => {
                    if (!t.calculation && recommended(t))
                      calculate(t, {
                        kind: recommended(t),
                        inputs: {},
                        verified: false,
                      });
                    setExpanded((ids) => [...new Set([...ids, t.id])]);
                    requestAnimationFrame(() =>
                      document
                        .getElementById(`takeoff-${t.id}`)
                        ?.scrollIntoView({ block: "nearest" }),
                    );
                  }}
                >
                  Complete inputs for {t.description || "Untitled item"}
                </button>{" "}
                <span>{missingFor(t).join(" · ")}</span>
              </li>
            ))}
          </ul>
          <p className="tiny">
            Enter verified values in the table or expand a calculator. Blank
            values remain unknown; no dimensions are read from pixels and no
            labour hours or prices are generated.
          </p>
        </details>
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
              ({q.takeoff.filter((t) => groupFor(t) === group).length})
            </span>
          </h3>
          <p className="tiny takeoff-scroll-hint">
            Expand a material to verify drawing facts, measurements and
            quantity, then approve and add to estimate.
          </p>
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
              {q.takeoff
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
                          <strong>{t.description || "New material"}</strong>
                          <span>
                            {t.specification || "Specification requires input"}
                          </span>
                          <span>
                            {t.quantity === null
                              ? "Quantity requires input"
                              : `${t.quantity} ${t.unit}`}{" "}
                            · {t.confidence} confidence · {t.status}
                          </span>
                          <span>{t.classification ?? "Contractor entry"}</span>
                          {!!unresolvedOverlaps(q, t).length && (
                            <strong className="overlap-warning">
                              Potential overlap — compare before approval
                            </strong>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={7}>
                          <details
                            className="takeoff-evidence"
                            open={expanded.includes(t.id)}
                            onToggle={(e) => {
                              const open = e.currentTarget.open;
                              setExpanded((ids) =>
                                open
                                  ? [...new Set([...ids, t.id])]
                                  : ids.filter((id) => id !== t.id),
                              );
                            }}
                          >
                            <summary>
                              Review material — specifications, evidence &
                              calculations
                            </summary>
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
                                        {t.classification ?? "Contractor entry"}{" "}
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
                                            status and this item is included in
                                            our contract scope.
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
                              {!!overlappingItems(q, t).length && (
                                <section className="overlap-comparison">
                                  <h4>
                                    Compare potentially overlapping materials
                                  </h4>
                                  <p>
                                    Compare specifications, locations,
                                    quantities, methods and source evidence.
                                    Different assemblies and work by others must
                                    remain separate. No quantities are added
                                    together.
                                  </p>
                                  {overlappingItems(q, t).map((peer) => (
                                    <article key={peer.id}>
                                      <b>{peer.description}</b>
                                      {t.quantity !== null &&
                                        peer.quantity !== null &&
                                        t.quantity !== peer.quantity &&
                                        t.unit === peer.unit && (
                                          <p className="info">
                                            Conflicting counts: {t.quantity}{" "}
                                            versus {peer.quantity} {t.unit}.
                                            Reconcile physical locations against
                                            the plan; do not add counts or
                                            choose the larger count. Keep
                                            separate only if verified as
                                            different components.
                                          </p>
                                        )}
                                      <p>
                                        {peer.specification ||
                                          "Specification unknown"}{" "}
                                        · {peer.location || "Location unknown"}{" "}
                                        · {peer.quantity ?? "Unknown"}{" "}
                                        {peer.unit} · {workScope(peer)} ·{" "}
                                        {peer.alternativeOption ||
                                          "Method unspecified"}
                                      </p>
                                      <p>
                                        Source: {peer.documentId || "manual"},
                                        page {peer.page ?? "unknown"};{" "}
                                        {peer.sourceFacts?.join("; ")}{" "}
                                        {peer.notes}
                                      </p>
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
                                        Confirm separate items
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
                                        Consolidate matching material
                                      </button>
                                    </article>
                                  ))}
                                </section>
                              )}

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
                                          {Number(
                                            (measurement.inches / 12).toFixed(
                                              6,
                                            ),
                                          )}{" "}
                                          ft) · {measurement.confidence}{" "}
                                          confidence · source{" "}
                                          {measurement.documentId}, page{" "}
                                          {measurement.page ?? "unknown"},
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
                                    semanticItemKey(t),
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
                              <div className="fields compact">
                                <Field label="Work scope">
                                  <select
                                    value={workScope(t)}
                                    onChange={(e) =>
                                      patch(t, {
                                        workScope: e.target
                                          .value as TakeoffItem["workScope"],
                                        included: e.target.value === "New work",
                                        scopeVerified: false,
                                      })
                                    }
                                  >
                                    {[
                                      "New work",
                                      "Existing work",
                                      "By others",
                                    ].map((value) => (
                                      <option key={value}>{value}</option>
                                    ))}
                                  </select>
                                </Field>
                                <label className="check-options">
                                  <input
                                    type="checkbox"
                                    checked={includedScope(t)}
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
                              <div className="material-calculator">
                                <h4>
                                  2. Verified measurements & calculated quantity
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
                                                  recipe.inputs[field.key] ?? ""
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
                                                {field.options.map((option) => (
                                                  <option
                                                    key={option.value}
                                                    value={option.value}
                                                  >
                                                    {option.label}
                                                  </option>
                                                ))}
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
                                                      [field.key]: Number.isNaN(
                                                        value,
                                                      )
                                                        ? null
                                                        : value,
                                                    },
                                                  })
                                                }
                                              />
                                            )}
                                          </Field>
                                          {/\((?:ft|in)\)/.test(field.label) &&
                                            !!drawingMeasurements(t).length && (
                                              <label className="field">
                                                <span>
                                                  Use written measurement for{" "}
                                                  {field.label}
                                                </span>
                                                <select
                                                  aria-label={`Use written measurement for ${field.label}`}
                                                  value=""
                                                  onChange={(e) => {
                                                    if (!e.target.value) return;
                                                    const m =
                                                      drawingMeasurements(t)[
                                                        Number(e.target.value) -
                                                          1
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
                                                    Choose a source observation
                                                    — verify its role
                                                  </option>
                                                  {drawingMeasurements(t).map(
                                                    (m, index) => (
                                                      <option
                                                        key={index}
                                                        value={index + 1}
                                                      >
                                                        {m.written} · {m.fact} ·
                                                        page{" "}
                                                        {m.page ?? "unknown"} ·{" "}
                                                        {m.confidence}
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
                                      I verified all calculator inputs, selected
                                      materials, cut layout and specifications.
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
                                      design or splice engineering is inferred.
                                      Openings, support layout and product
                                      coverage must be verified. Edit quantity
                                      directly to leave the calculator and enter
                                      a manual count.
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
                                                      kind !== "Informational",
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
                                                    (item) => item.id !== t.id,
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
