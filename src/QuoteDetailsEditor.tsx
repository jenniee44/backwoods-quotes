import { detailLabels } from "./model";
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
                checked={value[k]}
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
      <p className="muted">
        Labour hours are hidden by default. Grouped quotes show each scope
        group's total; internal details remain private.
      </p>
      <h3 className="subheading">
        {company
          ? "Reusable customer-document defaults"
          : "Customer-document details"}
      </h3>
      <div className="fields">
        {(Object.keys(detailLabels) as (keyof typeof detailLabels)[])
          .filter((k) => company || k !== "terms")
          .map((k) => (
            <label className="field" key={k}>
              <span>{detailLabels[k]}</span>
              <textarea
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
