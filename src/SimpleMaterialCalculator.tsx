import { useState } from "react";
import type { TakeoffItem } from "./model";
import NumberInput from "./NumberInput";
import {
  calculators,
  calculateMaterial,
  activeCalculatorFields,
  type MaterialCalculation,
} from "../shared/materialCalculators";
import { drawingMeasurements } from "../shared/constructionMeasurements";
import { formatFeet } from "../shared/measurementFormatting";
import { friendlyMaterialName } from "./preliminaryMaterials";
import {
  quickMaterialDraft,
  quickMaterialChanges,
  needsStockLength,
} from "./quickMaterialEdit";
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
export default function SimpleMaterialCalculator({
  item: t,
  disabled,
  onCalculate,
  onPatch,
  onEdit,
  requirements = [],
}: {
  item: TakeoffItem;
  disabled: boolean;
  onCalculate: (recipe: MaterialCalculation) => void;
  onPatch: (delta: Partial<TakeoffItem>) => void;
  onEdit: (delta: Partial<TakeoffItem>) => void;
  requirements?: string[];
}) {
  const [error, setError] = useState("");
  const recipe = t.calculation,
    definition = calculators.find((d) => d.kind === recipe?.kind),
    preview = recipe ? calculateMaterial(recipe, false) : null;
  const calculate = (_t: TakeoffItem, r: MaterialCalculation) => onCalculate(r);
  const patch = (_t: TakeoffItem, d: Partial<TakeoffItem>) => onPatch(d);
  const recommended = /hanger|fastener|screw|bolt|connector/i.test(
    t.description,
  )
    ? "hardware"
    : /beam/i.test(t.description)
      ? "beam-runs"
      : /joist/i.test(t.description)
        ? "joists"
        : /deck(?:ing)? boards|decking/i.test(t.description)
          ? "decking-layout"
          : /post/i.test(t.description)
            ? "post-stock"
            : "";
  function edit(delta: Partial<ReturnType<typeof quickMaterialDraft>>) {
    try {
      setError("");
      onEdit(quickMaterialChanges(t, { ...quickMaterialDraft(t), ...delta }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <fieldset
      disabled={disabled}
      className="simple-material-calculator"
      aria-label="Material purchasing calculator"
    >
      <h4>{friendlyMaterialName(t)}</h4>
      <div className="fields compact">
        <Field label="Material">
          <input
            aria-label="Calculator material"
            key={t.description}
            defaultValue={t.description}
            onBlur={(e) => {
              if (e.target.value !== t.description)
                edit({ description: e.target.value });
            }}
          />
        </Field>
        <Field label="Specifications">
          <input
            aria-label="Calculator specifications"
            key={t.specification}
            defaultValue={t.specification ?? ""}
            onBlur={(e) => {
              if (e.target.value !== (t.specification ?? ""))
                edit({ specification: e.target.value });
            }}
          />
        </Field>
      </div>
      {!recipe && recommended && (
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            onCalculate({ kind: recommended, inputs: {}, verified: false })
          }
        >
          Calculate purchasing quantity
        </button>
      )}
      {!!requirements.length && (
        <section aria-label="Purchasing requirements">
          <b>Drawing requirements — confirm applicability</b>
          {requirements.map((text, i) => (
            <p className="tiny" key={i}>
              {text}
            </p>
          ))}
        </section>
      )}
      <div className="material-calculator">
        <h4>Measurements & purchasing quantity</h4>
        <p className="tiny">
          Confirm measurements and purchasing requirements. Missing inputs
          remain to confirm; calculations do not approve materials.
        </p>
        <Field label="Material calculator">
          <select
            aria-label="Material calculator"
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
            <option value="">Manual verified quantity</option>
            {calculators.map((c) => (
              <option key={c.kind} value={c.kind}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        {recipe && definition && (
          <>
            <details>
              <summary>Calculation explanation</summary>
              <p>{definition.formula}</p>
            </details>
            <div className="fields compact">
              {recipe.kind === "beam-runs" &&
                Array.from(
                  {
                    length: Math.min(
                      Math.max(Math.floor(recipe.inputs.runs ?? 0), 0),
                      20,
                    ),
                  },
                  (_, i) => i + 1,
                ).map((n) => (
                  <label className="field" key={n}>
                    <span>Run {n} verified cutting / splice plan</span>
                    <textarea
                      aria-label={`Run ${n} verified cutting / splice plan`}
                      maxLength={2000}
                      value={recipe.arrangements?.[String(n)] ?? ""}
                      placeholder="Record cut lengths, stock pieces and the approved splice/support arrangement. Do not design or assume a splice."
                      onChange={(e) =>
                        calculate(t, {
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
                ))}
              {activeCalculatorFields(definition, recipe).map((field) => (
                <div key={field.key}>
                  <Field label={field.label}>
                    {field.options ? (
                      <select
                        aria-label={field.label}
                        value={recipe.inputs[field.key] ?? ""}
                        onChange={(e) =>
                          calculate(t, {
                            ...recipe,
                            verified: false,
                            inputs: {
                              ...recipe.inputs,
                              [field.key]:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            },
                          })
                        }
                      >
                        <option value="">Choose a confirmed value</option>
                        {field.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <NumberInput
                        nullable
                        value={recipe.inputs[field.key] ?? null}
                        step={field.integer ? "1" : "any"}
                        onChange={(value) =>
                          calculate(t, {
                            ...recipe,
                            verified: false,
                            inputs: {
                              ...recipe.inputs,
                              [field.key]: Number.isNaN(value) ? null : value,
                            },
                          })
                        }
                      />
                    )}
                  </Field>
                  {field.label.includes("(ft)") &&
                    recipe.inputs[field.key] != null && (
                      <p className="tiny">
                        {formatFeet(recipe.inputs[field.key]!)}
                      </p>
                    )}
                  {/\((?:ft|in)\)/.test(field.label) &&
                    !!drawingMeasurements(t).length && (
                      <label className="field">
                        <span>Use written measurement for {field.label}</span>
                        <select
                          aria-label={`Use written measurement for ${field.label}`}
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const m =
                              drawingMeasurements(t)[
                                Number(e.target.value) - 1
                              ];
                            if (!m) return;
                            calculate(t, {
                              ...recipe,
                              verified: false,
                              inputs: {
                                ...recipe.inputs,
                                [field.key]: field.label.includes("(ft)")
                                  ? m.inches / 12
                                  : m.inches,
                              },
                            });
                          }}
                        >
                          <option value="">
                            Choose an extracted measurement — confirm its use
                          </option>
                          {drawingMeasurements(t).map((m, index) => (
                            <option key={index} value={index + 1}>
                              {m.written}
                            </option>
                          ))}
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
              I verified all calculator inputs, selected materials, cut layout
              and specifications.{" "}
              {recipe.kind === "beam-runs" &&
                "These are separate physical beam runs, not repeated drawing views."}
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
              Counts and purchase allowances only: no span, connection,
              stair-code, footing design or splice engineering is inferred.
              Openings, support layout and product coverage must be verified.
              Choose Manual verified quantity to enter a contractor-confirmed
              count.
            </p>
          </>
        )}
      </div>

      {!recipe && (
        <div className="fields compact">
          <Field label="Verified purchase quantity">
            <NumberInput
              nullable
              value={t.quantity}
              onChange={(n) => edit({ quantity: Number.isNaN(n) ? null : n })}
            />
          </Field>
          <Field label="Purchase unit">
            <input
              aria-label="Calculator purchase unit"
              defaultValue={t.unit}
              key={t.unit}
              onBlur={(e) => {
                if (e.target.value !== t.unit) edit({ unit: e.target.value });
              }}
            />
          </Field>
          {needsStockLength(t) && (
            <Field label="Required stock length (ft)">
              <NumberInput
                nullable
                value={t.stockLength ?? null}
                onChange={(n) =>
                  edit({ stockLength: Number.isNaN(n) ? null : n })
                }
              />
            </Field>
          )}
        </div>
      )}
      {!recipe &&
        t.origin === "ai" &&
        t.destination === "Materials" &&
        (t.category === "Beams" || /\bbeams?\b/i.test(t.description)) && (
          <label className="check-options">
            <input
              type="checkbox"
              checked={!!t.purchaseVerified}
              onChange={(e) => patch(t, { purchaseVerified: e.target.checked })}
            />
            I verified beam purchase quantities, lengths, plies, stock and
            approved cut/splice layout. Run counts are not purchase boards.
          </label>
        )}
      {error && <p role="alert">{error}</p>}
      <p>
        <b>Purchase quantity:</b>{" "}
        {t.quantity === null ? "To confirm" : `${t.quantity} ${t.unit}`}
      </p>
      <p className="tiny">
        Confirm the included assembly and required product before approval.
        Existing work and excluded scope stay out of the estimate.
      </p>
    </fieldset>
  );
}
