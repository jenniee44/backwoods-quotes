import { hasReadableSpecification } from "./takeoffRequirements";
import { useEffect, useState } from "react";
import NumberInput from "./NumberInput";
import type { TakeoffItem } from "./model";
import type { MaterialCalculation } from "../shared/materialCalculators";
import {
  beamLengthSuggestions,
  suggestedStock,
  beamNextStep,
} from "./beamPrefill";
export { beamLengthSuggestions } from "./beamPrefill";
export default function BeamRunsEditor({
  item,
  recipe,
  onChange,
  disabled = false,
}: {
  disabled?: boolean;
  item: TakeoffItem;
  recipe: MaterialCalculation;
  onChange: (r: MaterialCalculation) => void;
}) {
  const [stockError, setStockError] = useState("");
  const count = Math.min(20, Math.max(0, Math.floor(recipe.inputs.runs ?? 0))),
    plies =
      Number(item.specification?.match(/\b(\d+)\s*[- ]?ply\b/i)?.[1]) || null,
    suggestions = beamLengthSuggestions(item);
  const set = (key: string, value: number | null) => {
    const lengthSources = { ...recipe.lengthSources };
    if (key.startsWith("length")) delete lengthSources[key.slice(6)];
    onChange({
      ...recipe,
      verified: false,
      lengthSources,
      inputs: { ...recipe.inputs, [key]: value },
    });
  };
  useEffect(() => {
    if (disabled) return;
    if (!item.reviewAcknowledged || !plies || !item.specification || !count)
      return;
    const inputs = { ...recipe.inputs },
      specifications = { ...recipe.specifications };
    let changed = false;
    for (let n = 1; n <= count; n++)
      if (
        inputs["plies" + n] === undefined &&
        specifications[String(n)] === undefined
      ) {
        inputs["plies" + n] = plies;
        specifications[String(n)] = item.specification;
        changed = true;
      }
    if (changed)
      onChange({ ...recipe, verified: false, inputs, specifications });
  }, [
    disabled,
    item.reviewAcknowledged,
    item.specification,
    count,
    plies,
    recipe,
    onChange,
  ]);
  return (
    <div className="beam-run-sections">
      <details>
        <summary>Available stock sizes</summary>
        <label className="field">
          <span>Available stock board lengths (ft), separated by commas</span>
          <input
            aria-label="Available stock lengths"
            defaultValue={recipe.availableStock?.join(", ") ?? ""}
            onBlur={(e) => {
              const parts = e.target.value.trim()
                ? e.target.value.split(",").map((x) => Number(x.trim()))
                : [];
              if (
                parts.length > 20 ||
                parts.some((x) => !Number.isFinite(x) || x <= 0 || x > 1000)
              ) {
                setStockError(
                  "Enter up to 20 available positive board lengths.",
                );
                return;
              }
              setStockError("");
              const availableStock = [...new Set(parts)].sort((a, b) => a - b);
              if (
                JSON.stringify(availableStock) !==
                JSON.stringify(recipe.availableStock ?? [])
              )
                onChange({ ...recipe, availableStock, verified: false });
            }}
          />
        </label>
        <small>
          No standard stock sizes are assumed. Availability is configured for
          this beam calculation.
        </small>
        {stockError && <p role="alert">{stockError}</p>}
      </details>
      <section aria-label="Visual beam layout review">
        <h5>Visual beam layout review</h5>
        <p className="tiny">
          Confirm each distinct beam line against the original drawing. The diagram
          shows order and support count only: it is NOT to scale, does not infer
          span lengths, and does not set lumber purchase quantities.
        </p>
        <p>
          <strong>{count} beam {count === 1 ? "line" : "lines"} in this calculator.</strong>{" "}
          {count < 20 && !disabled && (
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                onChange({
                  ...recipe,
                  verified: false,
                  inputs: { ...recipe.inputs, runs: count + 1 },
                  runLabels: {
                    ...recipe.runLabels,
                    [String(count + 1)]: `Beam line ${count + 1} — confirm on drawing`,
                  },
                })
              }
            >
              Add another beam line for review
            </button>
          )}
        </p>
        <small>
          Only add a distinct physical line you can verify. Repeated labels,
          detail drawings, and individual spans are not extra beam lines.
        </small>
      </section>
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
        const length = recipe.inputs["length" + n],
          feet = length == null ? null : Math.floor(length),
          inches =
            length == null
              ? null
              : Math.round((length - Math.floor(length)) * 12 * 1e6) / 1e6;
        return (
          <section
            className="beam-run-section"
            key={n}
            aria-label={`Beam ${n}`}
          >
            <h5>
              Beam {n} —{" "}
              {(
                recipe.specifications?.[String(n)] ??
                item.specification ??
                "Specification to confirm"
              )
                .replace(/\b(\d+)\s*[- ]?ply\b/gi, "$1-ply")
                .replace(/(\d+)\s*[x×]\s*(\d+)/gi, "$1×$2")}
            </h5>
            <p className="tiny">{beamNextStep(recipe, n)}</p>
            <div className="fields compact" aria-label={`Beam ${n} support review`}>
              <label className="field">
                <span>Beam line identifier (as seen on plan)</span>
                <input
                  aria-label={`Beam ${n} drawing label`}
                  maxLength={150}
                  disabled={disabled}
                  value={recipe.runLabels?.[String(n)] ?? ""}
                  placeholder="Upper, middle, lower, or drawing label"
                  onChange={(e) =>
                    onChange({
                      ...recipe,
                      verified: false,
                      runLabels: { ...recipe.runLabels, [String(n)]: e.target.value },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Visible support positions — not new pile count</span>
                <NumberInput
                  nullable
                  step="1"
                  value={recipe.supportReviews?.[String(n)]?.count ?? null}
                  onChange={(value) => {
                    const supportCount =
                      Number.isInteger(value) && value >= 2 && value <= 20
                        ? value
                        : null;
                    onChange({
                      ...recipe,
                      verified: false,
                      supportReviews: {
                        ...recipe.supportReviews,
                        [String(n)]: { count: supportCount, confirmed: false },
                      },
                    });
                  }}
                />
              </label>
            </div>
            {(() => {
              const review = recipe.supportReviews?.[String(n)];
              const supports = review?.count ?? 0;
              return (
                <div className="beam-support-visual">
                  <svg
                    viewBox="0 0 480 88"
                    role="img"
                    aria-label={`Schematic for beam ${n}: ${supports ? supports + " support positions" : "supports not yet entered"}`}
                    style={{ width: "100%", maxWidth: 550, height: 100 }}
                  >
                    <line x1="24" y1="40" x2="456" y2="40" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                    {Array.from({ length: supports }, (_, i) => {
                      const x = 24 + (432 * i) / (supports - 1);
                      return (
                        <g key={i}>
                          <circle cx={x} cy="40" r="9" stroke="currentColor" strokeWidth="2" fill="white" />
                          <text x={x} y="73" fontSize="12" textAnchor="middle" fill="currentColor">{i + 1}</text>
                        </g>
                      );
                    })}
                  </svg>
                  <p className="tiny">
                    {supports
                      ? `${supports} support positions → ${supports - 1} intervals (not stock boards or confirmed pile counts).`
                      : "Enter the number of visible supports to display a schematic."}
                  </p>
                  <label className="check-options">
                    <input
                      type="checkbox"
                      disabled={disabled || supports < 2}
                      checked={review?.confirmed === true}
                      onChange={(e) =>
                        onChange({
                          ...recipe,
                          verified: false,
                          supportReviews: {
                            ...recipe.supportReviews,
                            [String(n)]: { count: supports, confirmed: e.target.checked },
                          },
                        })
                      }
                    />
                    I compared this beam line and its support count against the original plan.
                  </label>
                  <small>
                    Confirmation is saved with this quote but does not approve engineering,
                    beam cut lengths, splices or purchasing quantities. Use the original
                    drawing viewer for precise support locations.
                  </small>
                </div>
              );
            })()}

            <div className="fields compact">
              <label className="field">
                <span>Beam length — feet</span>
                <NumberInput
                  nullable
                  value={feet}
                  onChange={(v) =>
                    set(
                      "length" + n,
                      Number.isNaN(v) ? null : v + (inches ?? 0) / 12,
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Beam length — inches</span>
                <NumberInput
                  nullable
                  value={inches}
                  onChange={(v) =>
                    set(
                      "length" + n,
                      Number.isNaN(v) ? null : (feet ?? 0) + v / 12,
                    )
                  }
                />
              </label>
              <label className="field">
                <span>Lumber size and specification</span>
                <input
                  aria-label={`Beam ${n} specification`}
                  maxLength={300}
                  value={
                    recipe.specifications?.[String(n)] ??
                    item.specification ??
                    ""
                  }
                  placeholder="To confirm"
                  onChange={(e) =>
                    onChange({
                      ...recipe,
                      verified: false,
                      specifications: {
                        ...recipe.specifications,
                        [String(n)]: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Number of plies</span>
                <NumberInput
                  nullable
                  step="1"
                  value={recipe.inputs["plies" + n] ?? null}
                  onChange={(v) => set("plies" + n, Number.isNaN(v) ? null : v)}
                />
              </label>
              <label className="field">
                <span>Stock board length (ft)</span>
                <NumberInput
                  nullable
                  value={recipe.inputs["stock" + n] ?? null}
                  onChange={(v) => set("stock" + n, Number.isNaN(v) ? null : v)}
                />
              </label>
            </div>
            {hasReadableSpecification(item) &&
              plies &&
              item.confidence === "High" &&
              recipe.inputs["plies" + n] == null && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() =>
                    onChange({
                      ...recipe,
                      verified: false,
                      inputs: { ...recipe.inputs, ["plies" + n]: plies },
                      specifications: {
                        ...recipe.specifications,
                        [String(n)]: item.specification!,
                      },
                    })
                  }
                >
                  Use drawing specification and {plies} plies — proposed
                </button>
              )}
            {suggestedStock(recipe, n) !== null &&
              recipe.inputs["stock" + n] == null && (
                <p>
                  Suggested available stock: {suggestedStock(recipe, n)} ft{" "}
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => set("stock" + n, suggestedStock(recipe, n))}
                  >
                    Use suggested stock
                  </button>
                </p>
              )}
            <p>
              <b>Estimated boards before waste:</b>{" "}
              {recipe.inputs["length" + n] != null &&
              recipe.inputs["plies" + n] != null &&
              recipe.inputs["pieces" + n] != null &&
              !!recipe.arrangements?.[String(n)]?.trim() &&
              (recipe.inputs["stock" + n] ?? suggestedStock(recipe, n) ?? 0) *
                recipe.inputs["pieces" + n]! >=
                recipe.inputs["length" + n]!
                ? recipe.inputs["plies" + n]! * recipe.inputs["pieces" + n]!
                : "To confirm"}{" "}
              —{" "}
              {recipe.verified
                ? "contractor confirmed; approval required"
                : "estimate only, not verified purchasing"}
            </p>
            <details className="beam-advanced">
              <summary>Advanced Details</summary>
              <label className="field">
                <span>Number of boards per ply</span>
                <NumberInput
                  nullable
                  step="1"
                  value={recipe.inputs["pieces" + n] ?? null}
                  onChange={(v) =>
                    set("pieces" + n, Number.isNaN(v) ? null : v)
                  }
                />
              </label>{" "}
              {!!suggestions.length && (
                <label className="field">
                  <span>
                    Proposed drawing length — confirm the correct beam
                  </span>
                  <select
                    aria-label={`Beam ${n} proposed drawing length`}
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const m = suggestions[Number(e.target.value) - 1];
                      onChange({
                        ...recipe,
                        verified: false,
                        inputs: {
                          ...recipe.inputs,
                          ["length" + n]: m.inches / 12,
                        },
                        lengthSources: {
                          ...recipe.lengthSources,
                          [String(n)]:
                            `${m.label}: ${m.written} · ${m.references.join("; ")}`.slice(
                              0,
                              2000,
                            ),
                        },
                      });
                    }}
                  >
                    <option value="">
                      To confirm — select only a matching beam
                    </option>
                    {suggestions.map((m, i) => (
                      <option value={i + 1} key={i}>
                        {m.label}: {m.written} · {m.references.join("; ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {recipe.lengthSources?.[String(n)] && (
                <p className="tiny">
                  Drawing reference: {recipe.lengthSources[String(n)]} —{" "}
                  {recipe.verified
                    ? "contractor verified"
                    : "proposed; verify before purchase"}
                </p>
              )}
              {recipe.inputs["pieces" + n] === 1 ? (
                <details>
                  <summary>
                    Cutting plan notes (optional for continuous boards)
                  </summary>{" "}
                  <label className="field">
                    <span>Approved cutting / splicing arrangement</span>
                    <textarea
                      aria-label={`Beam ${n} approved arrangement`}
                      maxLength={2000}
                      value={recipe.arrangements?.[String(n)] ?? ""}
                      placeholder="Record the continuous-board or approved cut/splice arrangement. Never assume a structural splice."
                      onChange={(e) =>
                        onChange({
                          ...recipe,
                          verified: false,
                          arrangements: {
                            ...recipe.arrangements,
                            [String(n)]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </details>
              ) : (
                <>
                  {" "}
                  <label className="field">
                    <span>Approved cutting / splicing arrangement</span>
                    <textarea
                      aria-label={`Beam ${n} approved arrangement`}
                      maxLength={2000}
                      value={recipe.arrangements?.[String(n)] ?? ""}
                      placeholder="Record the continuous-board or approved cut/splice arrangement. Never assume a structural splice."
                      onChange={(e) =>
                        onChange({
                          ...recipe,
                          verified: false,
                          arrangements: {
                            ...recipe.arrangements,
                            [String(n)]: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </>
              )}
              <label className="check-options">
                <input
                  type="checkbox"
                  aria-label={`Beam ${n} arrangement confirmed`}
                  checked={recipe.inputs["layout" + n] === 1}
                  onChange={(e) =>
                    onChange({
                      ...recipe,
                      verified: false,
                      inputs: {
                        ...recipe.inputs,
                        ["layout" + n]: e.target.checked ? 1 : null,
                      },
                      arrangements: {
                        ...recipe.arrangements,
                        [String(n)]:
                          recipe.arrangements?.[String(n)] ||
                          (e.target.checked && recipe.inputs["pieces" + n] === 1
                            ? "Contractor confirmed one continuous, unspliced board per ply and verified supports."
                            : ""),
                      },
                    })
                  }
                />
                I confirmed this beam's cutting/splicing arrangement and
                supports.
              </label>
              {recipe.specificationSources?.[String(n)] && (
                <p>
                  Specification / plies source:{" "}
                  {recipe.specificationSources[String(n)]}
                </p>
              )}
              {recipe.runLabels?.[String(n)] && (
                <p>Drawing beam label: {recipe.runLabels[String(n)]}</p>
              )}
              <p>
                AI confidence: {item.confidence}; all extracted inputs remain
                proposed until reviewed.
              </p>
            </details>
            <small>
              Drawing information remains proposed until contractor
              verification. No stock size or splice is assumed.
            </small>
          </section>
        );
      })}
    </div>
  );
}
