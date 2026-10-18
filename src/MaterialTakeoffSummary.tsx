import { useState } from "react";
import type { Quote, TakeoffItem } from "./model";
import {
  materialTakeoffProposal,
  applyTakeoffPreferences,
} from "./deckTakeoff";
import { purchasingGroups } from "./purchasingGroups";
import {
  approveSummaryMaterials,
  summaryApprovalProblem,
} from "./materialsSummary";
import { editTakeoff } from "./planAnalysis";
import {
  activeCalculatorFields,
  calculators,
  calculateMaterial,
  validCalculation,
} from "../shared/materialCalculators";
import { friendlyMaterialName } from "./preliminaryMaterials";
import { formatQuantity } from "../shared/measurementFormatting";
type Props = {
  quote: Quote;
  locked: boolean;
  unresolvedOnly: boolean;
  onChange: (q: Quote) => void;
  onError: (s: string) => void;
  onAdvanced: (id: string) => void;
};
export default function MaterialTakeoffSummary(props: Props) {
  const { quote: q } = props;
  const [stockText, setStockText] = useState(
    q.takeoffPreferences?.availableStock.join(", ") ?? "",
  );
  const [wasteText, setWasteText] = useState(
    q.takeoffPreferences?.waste?.toString() ?? "",
  );
  const groups = purchasingGroups(q, q.takeoff);
  return (
    <section
      className="automatic-takeoff"
      aria-label="Material Takeoff Summary"
    >
      <h4>Material Takeoff Summary</h4>
      <p className="tiny">
        Drawing quantities are proposed. Verify measurements, stock
        availability, waste and cutting requirements. Approval is a separate
        step.
      </p>
      <details className="takeoff-preferences">
        <summary>Purchasing preferences — available stock and waste</summary>
        <p className="tiny">
          Optional, for this quote. Applies only to never-entered inputs on
          unreviewed materials. Suggestions do not verify availability or
          approve cutting/splices.
        </p>
        <label>
          Available stock lengths for this quote (ft)
          <input
            value={stockText}
            disabled={props.locked}
            placeholder="Enter available sizes, e.g. 8, 12, 16"
            onChange={(e) => setStockText(e.target.value)}
          />
        </label>
        <label>
          Proposed waste allowance for this quote (%)
          <input
            type="number"
            min="0"
            max="100"
            value={wasteText}
            disabled={props.locked}
            onChange={(e) => setWasteText(e.target.value)}
          />
        </label>
        <button
          className="button secondary"
          disabled={props.locked}
          onClick={() => {
            try {
              props.onChange(
                applyTakeoffPreferences(
                  q,
                  stockText.trim()
                    ? stockText.split(",").map((s) => Number(s.trim()))
                    : [],
                  wasteText.trim() ? Number(wasteText) : null,
                ),
              );
              props.onError("");
            } catch (e) {
              props.onError((e as Error).message);
            }
          }}
        >
          Apply to missing purchasing inputs
        </button>
      </details>
      {groups
        .filter(
          (g) =>
            !props.unresolvedOnly ||
            g.items.some(
              (t) =>
                !!summaryApprovalProblem(q, t) &&
                t.status !== "Approved" &&
                !t.convertedLineId,
            ),
        )
        .map((g) =>
          g.items.length === 1 ? (
            <MaterialRow key={g.items[0].id} {...props} item={g.items[0]} />
          ) : (
            <article className="takeoff-summary-card" key={g.items[0].id}>
              <strong>
                {g.name} —{" "}
                {g.items[0].specification || "Specification to confirm"}
              </strong>
              <p>
                Quantity to confirm · {g.items.length} source assemblies or
                overlapping observations. Counts are not added.
              </p>
              <details>
                <summary>Compare assemblies before approval</summary>
                {g.items.map((t) => (
                  <MaterialRow key={t.id} {...props} item={t} />
                ))}
              </details>
            </article>
          ),
        )}
      {!groups.length && (
        <p>
          No included purchase materials yet. Drawing notes and excluded work
          remain in Reference and excluded work.
        </p>
      )}
    </section>
  );
}
function MaterialRow({ item: t, ...props }: Props & { item: TakeoffItem }) {
  const { quote: q, locked, onChange, onError, onAdvanced } = props;
  const [editing, setEditing] = useState(false),
    [acknowledged, setAcknowledged] = useState(false),
    [geometryAcknowledged, setGeometryAcknowledged] = useState(false);
  const proposal = materialTakeoffProposal(t),
    recipe = t.calculation,
    definition = calculators.find((c) => c.kind === recipe?.kind);
  const disabled = locked || q.status !== "Draft" || !!t.convertedLineId,
    problem = summaryApprovalProblem(q, t);
  function patch(delta: Partial<TakeoffItem>) {
    if (disabled) return;
    if (
      (delta.calculation && !validCalculation(delta.calculation)) ||
      (delta.quantity !== undefined &&
        delta.quantity !== null &&
        (!Number.isFinite(delta.quantity) || delta.quantity < 0)) ||
      (delta.specification?.length ?? 0) > 1000
    ) {
      onError(
        "Enter valid non-negative quantities and calculator inputs; keep specifications under 1,000 characters.",
      );
      return;
    }
    onError("");
    setAcknowledged(false);
    setGeometryAcknowledged(false);
    const updated = editTakeoff(t, delta);
    if (delta.status === "Rejected") updated.status = "Rejected";
    if (delta.scopeVerified === true) updated.scopeVerified = true;
    onChange({
      ...q,
      takeoff: q.takeoff.map((v) => (v.id === t.id ? updated : v)),
    });
  }
  function changeInput(key: string, value: string) {
    if (!recipe) return;
    patch({
      calculation: {
        ...recipe,
        verified: false,
        inputs: {
          ...recipe.inputs,
          [key]: value === "" ? null : Number(value),
        },
        inputSources: Object.fromEntries(
          Object.entries(recipe.inputSources ?? {}).filter(([k]) => k !== key),
        ),
      },
    });
  }
  function verify() {
    try {
      if (!acknowledged || !recipe)
        throw new Error(
          "Confirm measurements, included scope and purchasing requirements first.",
        );
      if (recipe.geometryConfirmed === false && !geometryAcknowledged)
        throw new Error(
          "Confirm the layout boundary, openings and edge members first.",
        );
      const calculation = {
        ...recipe,
        verified: true,
        ...(recipe.geometryConfirmed === false
          ? { geometryConfirmed: true }
          : {}),
      };
      const result = calculateMaterial(calculation);
      if (result.quantity === null) throw new Error(result.missing.join("; "));
      patch({
        calculation,
        quantity: result.quantity,
        unit: result.unit,
        stockLength: recipe.inputs.stock ?? t.stockLength,
        classification: "Calculated quantity",
        quantityMethod: "Calculated",
        calculationBasis: `${result.formula}; ${JSON.stringify(recipe.inputs)}; drawing input references retained in calculator`,
        scopeVerified: true,
      });
    } catch (e) {
      onError((e as Error).message);
    }
  }
  const canVerify =
    recipe &&
    (recipe.geometryConfirmed === false
      ? geometryAcknowledged &&
        calculateMaterial({ ...recipe, geometryConfirmed: true }, false)
          .quantity !== null
      : proposal.purchase !== null);
  return (
    <article
      className="takeoff-summary-card"
      id={"summary-" + t.id}
      aria-label={"Takeoff material: " + t.description}
    >
      <div className="takeoff-card-heading">
        <div>
          <strong>{friendlyMaterialName(t)}</strong>
          <span>{t.specification || "Specification to confirm"}</span>
        </div>
        <span className="takeoff-status">
          {t.convertedLineId
            ? "Added to estimate"
            : t.status === "Approved"
              ? "Approved"
              : recipe?.verified
                ? "Calculation verified"
                : "Proposed"}
        </span>
      </div>
      <div className="takeoff-quantities">
        <span>
          Material quantity:{" "}
          <strong>
            {proposal.quantity === null
              ? "To confirm"
              : formatQuantity(proposal.quantity, proposal.unit)}
          </strong>
        </span>
        <span>
          Purchasing:{" "}
          <strong>
            {proposal.purchase === null
              ? "To confirm"
              : `${formatQuantity(proposal.purchase, proposal.purchaseUnit)}${recipe?.verified ? " — verified" : " — estimate"}`}
          </strong>
        </span>
      </div>
      <small>
        {t.sourceDocumentName || "Source drawing"} · page{" "}
        {t.page ?? "to confirm"} · {t.confidence} confidence
      </small>
      {!!proposal.missing.length && !t.convertedLineId && (
        <p className="takeoff-next-step">{proposal.missing[0]}</p>
      )}
      <div className="heading-actions">
        <button
          className="button secondary"
          disabled={disabled}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          Edit
        </button>
        <button
          className="button"
          disabled={disabled || !!problem}
          onClick={() => {
            if (
              !window.confirm(
                `Approve ${t.description}? Confirm you verified specifications, purchase quantities, included scope and drawing evidence.`,
              )
            )
              return;
            try {
              onChange(approveSummaryMaterials(q, [t.id], true));
              onError("");
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          Approve
        </button>
        <button
          className="button secondary"
          disabled={disabled || t.status === "Rejected"}
          onClick={() => patch({ status: "Rejected", included: false })}
        >
          Exclude
        </button>
      </div>
      {editing && (
        <div className="takeoff-quick-inputs">
          <label>
            Material specification
            <input
              value={t.specification ?? ""}
              disabled={disabled}
              maxLength={1000}
              onChange={(e) => patch({ specification: e.target.value })}
            />
          </label>
          {!recipe ? (
            <>
              <label>
                Contractor purchase quantity
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={t.quantity ?? ""}
                  onChange={(e) =>
                    patch({
                      quantity:
                        e.target.value === "" ? null : Number(e.target.value),
                      quantityMethod: "Unknown",
                      calculationBasis:
                        "Manual purchase quantity entered by contractor; review required",
                    })
                  }
                />
              </label>
              <label>
                Purchase unit
                <input
                  value={t.unit}
                  maxLength={60}
                  onChange={(e) =>
                    patch({
                      unit: e.target.value,
                      calculationBasis:
                        "Manual purchase unit entered by contractor; review required",
                    })
                  }
                />
              </label>
            </>
          ) : recipe.kind === "beam-runs" ? (
            <button
              className="button secondary"
              onClick={() => onAdvanced(t.id)}
            >
              Review individual beam measurements
            </button>
          ) : (
            <>
              {definition &&
                activeCalculatorFields(definition, recipe).map((field) => (
                  <label key={field.key}>
                    {field.label.replace(/^Verified /, "")}
                    {field.options ? (
                      <select
                        aria-label={field.label}
                        value={recipe.inputs[field.key] ?? ""}
                        onChange={(e) => changeInput(field.key, e.target.value)}
                      >
                        <option value="">To confirm</option>
                        {field.options.map((v) => (
                          <option key={v.value} value={v.value}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={field.label}
                        type="number"
                        step={field.integer ? "1" : "any"}
                        min={field.zero ? "0" : "0.001"}
                        value={recipe.inputs[field.key] ?? ""}
                        onChange={(e) => changeInput(field.key, e.target.value)}
                      />
                    )}
                    <small>
                      {recipe.inputSources?.[field.key]
                        ? "Drawing/configured proposal — verify"
                        : "Contractor input"}
                    </small>
                  </label>
                ))}
              {definition?.fields.some((f) => f.key === "stock") && (
                <label>
                  Available stock lengths (feet, comma separated)
                  <input
                    defaultValue={recipe.availableStock?.join(", ") ?? ""}
                    onBlur={(e) => {
                      const values = e.target.value.trim()
                        ? e.target.value.split(",").map((s) => Number(s.trim()))
                        : [];
                      if (
                        values.length > 20 ||
                        values.some(
                          (n) => !Number.isFinite(n) || n <= 0 || n > 1000,
                        )
                      ) {
                        onError(
                          "Enter up to 20 positive available stock lengths.",
                        );
                        return;
                      }
                      patch({
                        calculation: {
                          ...recipe,
                          availableStock: [...new Set(values)],
                          verified: false,
                        },
                      });
                    }}
                  />
                </label>
              )}
              {proposal.stockSuggestion !== null && (
                <p>
                  Suggested continuous stock: {proposal.stockSuggestion} ft.
                  Confirm availability; no splices or offcut reuse assumed.{" "}
                  <button
                    className="button secondary"
                    onClick={() =>
                      changeInput("stock", String(proposal.stockSuggestion))
                    }
                  >
                    Use suggested stock
                  </button>
                </p>
              )}
              <label className="check-options">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                I verified all measurements, included scope, stock availability,
                waste and cutting requirements.
              </label>
              {recipe.geometryConfirmed === false && (
                <label className="check-options">
                  <input
                    type="checkbox"
                    checked={geometryAcknowledged}
                    onChange={(e) => setGeometryAcknowledged(e.target.checked)}
                  />
                  I confirmed the regular layout boundary, openings and required
                  edge members.
                </label>
              )}
              <button
                className="button secondary"
                disabled={disabled || !acknowledged || !canVerify}
                onClick={verify}
              >
                Verify calculation
              </button>
            </>
          )}
          <button
            className="button secondary"
            onClick={() => setEditing(false)}
          >
            Done editing
          </button>
        </div>
      )}
      <details>
        <summary>View details</summary>
        <p>
          {proposal.formula || "Quantity calculation needs supported inputs."}
        </p>
        {!!proposal.missing.length && (
          <ul>
            {proposal.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        <details>
          <summary>Advanced evidence</summary>
          <ul>
            {[...new Set([...(t.sourceFacts ?? []), ...proposal.sources])].map(
              (s) => (
                <li key={s}>{s}</li>
              ),
            )}
          </ul>
          <p>{t.calculationBasis}</p>
          <p>{t.warnings?.join("; ")}</p>
        </details>
        <button className="button secondary" onClick={() => onAdvanced(t.id)}>
          Review details
        </button>
      </details>
    </article>
  );
}
