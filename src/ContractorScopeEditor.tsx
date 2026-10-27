import { useState } from "react";
import type { Quote } from "./model";
import {
  addContractorScope,
  scopeChoices,
  type ScopeChoice,
} from "./contractorScopeDecisions";
export default function ContractorScopeEditor({
  quote: q,
  locked,
  onChange,
  onError,
  onReview,
}: {
  quote: Quote;
  locked: boolean;
  onChange: (q: Quote) => void;
  onError: (s: string) => void;
  onReview: (id: string) => void;
}) {
  const [choice, setChoice] = useState<ScopeChoice>(scopeChoices[0]);
  const [description, setDescription] = useState("");
  const [specification, setSpecification] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <details className="contractor-scope">
      <summary>Project scope — alternatives and additional work</summary>
      <p>
        Keep drawing requirements unchanged. Add your included work or choose
        which unapproved footing observations a foundation alternative replaces.
        This does not authorize an engineering change.
      </p>
      <fieldset disabled={locked || q.status !== "Draft"}>
        <label>
          Included work
          <select
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value as ScopeChoice);
              setSelected([]);
              setAcknowledged(false);
            }}
          >
            {scopeChoices.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Scope description
          <input
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Confirmed specification, if known
          <input
            value={specification}
            maxLength={1000}
            onChange={(e) => setSpecification(e.target.value)}
          />
        </label>
        <label>
          Contractor scope quantity
          <input
            type="number"
            min="0"
            step="any"
            placeholder="Unknown"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          Scope quantity unit
          <input
            placeholder="Enter the scope quantity unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </label>
        {choice === scopeChoices[0] && (
          <fieldset>
            <legend>
              Drawing footing observations to exclude from this quote
            </legend>
            {q.takeoff
              .filter(
                (t) =>
                  !t.convertedLineId &&
                  t.status !== "Approved" &&
                  t.status !== "Rejected" &&
                  /footing|pier|foundation|concrete/i.test(t.description),
              )
              .map((t) => (
                <label className="check-options" key={t.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, t.id]
                          : ids.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.description} · page {t.page ?? "unknown"}
                </label>
              ))}
          </fieldset>
        )}
        <label className="check-options">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          This is my included job scope. I will verify quantities,
          specifications and any required engineering acceptance before
          approval.
        </label>
        <button
          type="button"
          disabled={!acknowledged}
          onClick={() => {
            try {
              onChange(
                addContractorScope(
                  q,
                  choice,
                  description,
                  specification,
                  quantity === "" ? null : Number(quantity),
                  unit,
                  selected,
                  acknowledged,
                ),
              );
              onError("");
              setAcknowledged(false);
              setDescription("");
              setSpecification("");
              setQuantity("");
              setUnit("");
              setSelected([]);
            } catch (e) {
              onError((e as Error).message);
            }
          }}
        >
          Add scope for review
        </button>
      </fieldset>
      <ul>
        {q.takeoff
          .filter(
            (t) =>
              t.notes.startsWith("Contractor project scope decision:") &&
              t.status !== "Rejected",
          )
          .map((t) => (
            <li key={t.id}>
              {t.description}: {t.quantity ?? "Quantity needed"} {t.unit} ·{" "}
              {t.status}{" "}
              <button type="button" onClick={() => onReview(t.id)}>
                Review scope item
              </button>
            </li>
          ))}
      </ul>
      <p className="tiny">
        Subcontracted piles appear in Advanced Review under Subcontractor.
        Nothing is approved, priced or sent to the estimate automatically.
        Unknown specifications stay missing.
      </p>
    </details>
  );
}
