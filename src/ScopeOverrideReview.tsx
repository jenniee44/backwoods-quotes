import { useState } from "react";
import type { Quote, TakeoffItem } from "./model";
import {
  applyScopeOverride,
  scopeReviewItems,
  scopeDecisions,
  type ScopeDecision,
} from "./scopeOverride";
export default function ScopeOverrideReview({
  quote,
  locked,
  onChange,
  onError,
}: {
  quote: Quote;
  locked: boolean;
  onChange: (q: Quote) => void;
  onError: (s: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="scope-override-review"
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary>Contractor scope — include, exclude or subcontract</summary>
      <p>
        Your confirmed quote scope can differ from a drawing’s “by others” note.
        Original drawing evidence stays unchanged. Applying scope requires a new
        material review; it does not approve or price anything.
      </p>
      {expanded &&
        scopeReviewItems(quote).map((item) => (
          <ScopeRow
            key={item.id}
            item={item}
            disabled={locked || !!item.convertedLineId}
            onApply={(choice) => {
              try {
                onChange(applyScopeOverride(quote, item.id, choice));
                onError("");
              } catch (e) {
                onError((e as Error).message);
              }
            }}
          />
        ))}
    </details>
  );
}
function ScopeRow({
  item,
  disabled,
  onApply,
}: {
  item: TakeoffItem;
  disabled: boolean;
  onApply: (choice: ScopeDecision) => void;
}) {
  const [choice, setChoice] = useState<ScopeDecision | "">(
    item.scopeOverride ?? "",
  );
  return (
    <div className="scope-review-row">
      <strong>{item.description}</strong>
      <p className="tiny">
        Drawing note:{" "}
        {item.notes || item.sourceFacts?.join("; ") || "Not specified"}
      </p>
      <label>
        Quote scope
        <select
          aria-label={`Quote scope: ${item.id}`}
          disabled={disabled}
          value={choice}
          onChange={(e) => setChoice(e.target.value as ScopeDecision | "")}
        >
          <option value="">Choose contractor scope</option>
          {scopeDecisions.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={disabled || !choice}
        onClick={() => choice && onApply(choice)}
      >
        Apply scope — {item.description}
      </button>
      {item.scopeOverride && (
        <small>
          Contractor confirmed: {item.scopeOverride}. Material approval is still
          required.
        </small>
      )}
    </div>
  );
}
