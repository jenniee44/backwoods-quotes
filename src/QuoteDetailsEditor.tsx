import { detailLabels, paymentError } from "./model";
import type { QuoteDetails } from "./model";
export default function QuoteDetailsEditor({
  value,
  onChange,
  disabled = false,
  company = false,
}: {
  value: QuoteDetails;
  onChange: (d: QuoteDetails) => void;
  disabled?: boolean;
  company?: boolean;
}) {
  return (
    <fieldset disabled={disabled}>
      <h3 className="subheading">Customer display options</h3>
      <div className="check-options">
        {(["showQuantities", "showLabourHours", "groupLines"] as const).map(
          (k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={k === "groupLines" ? true : value[k]}
                disabled={k === "groupLines"}
                onChange={(e) => onChange({ ...value, [k]: e.target.checked })}
              />
              {k === "showQuantities"
                ? "Show customer quantities"
                : k === "showLabourHours"
                  ? "Show estimated labour hours"
                  : "Group detailed quote by scope"}
            </label>
          ),
        )}
      </div>
      <label className="check-options">
        <input
          type="checkbox"
          checked={!!value.exposeContingency}
          onChange={(e) =>
            onChange({ ...value, exposeContingency: e.target.checked })
          }
        />
        Show contingency as a customer allowance (otherwise included in scope
        prices)
      </label>
      <p className="muted">
        Labour hours are hidden by default. Detailed quotes always group
        customer scopes to protect internal rows. Grouped quotes show each scope
        group's total; internal details remain private.
      </p>
      <h3 className="subheading">
        {company
          ? "Reusable customer-document defaults"
          : "Customer-document details"}
      </h3>
      <p className="muted">
        {company
          ? "These defaults are copied into new quotes only."
          : "Copied from company defaults when this quote was created. Edits here override this quote only."}
      </p>
      {paymentError(value.payment) && (
        <p role="alert" className="error">
          {paymentError(value.payment)}
        </p>
      )}
      <div className="fields">
        {(Object.keys(detailLabels) as (keyof typeof detailLabels)[])
          .filter((k) => company || k !== "terms")
          .map((k) => (
            <label className="field" key={k}>
              <span>{detailLabels[k]}</span>
              <textarea
                placeholder={
                  k === "payment"
                    ? "20% acceptance, 30% start, 30% midpoint, 20% substantial completion (example only)"
                    : "Optional — hidden on customer quote when empty"
                }
                rows={3}
                value={value[k]}
                onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              />
            </label>
          ))}
      </div>
    </fieldset>
  );
}
