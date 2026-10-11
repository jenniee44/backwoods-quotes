import { useRef, useState } from "react";
import type { TakeoffItem } from "./model";
import NumberInput from "./NumberInput";
import {
  quickMaterialDraft,
  quickMaterialChanges,
  needsStockLength,
} from "./quickMaterialEdit";
import { requiresScopeVerification } from "../shared/takeoff";
export default function QuickMaterialEdit({
  item,
  disabled,
  onSave,
  onClose,
  onAdvanced,
}: {
  item: TakeoffItem;
  disabled: boolean;
  onSave: (delta: Partial<TakeoffItem>) => void;
  onClose: () => void;
  onAdvanced: () => void;
}) {
  const original = useRef(item);
  const [draft, setDraft] = useState(() => quickMaterialDraft(item));
  const [error, setError] = useState("");
  const scopeUncertain = draft.scope !== "New work";
  const scopeNeedsVerification =
    requiresScopeVerification(item) || scopeUncertain;
  const blocked = [
    "Existing work to remain",
    "Requires scope confirmation",
  ].includes(draft.scope);
  return (
    <fieldset className="quick-material-edit" disabled={disabled}>
      <label className="field">
        <span>Material description</span>
        <input
          aria-label="Edit material description"
          value={draft.description}
          onChange={(e) =>
            setDraft({
              ...draft,
              description: e.target.value,
              scopeVerified: false,
              scopeAcknowledged: false,
            })
          }
        />
      </label>
      <label className="field">
        <span>Material specification</span>
        <input
          aria-label="Edit material specification"
          value={draft.specification}
          onChange={(e) =>
            setDraft({
              ...draft,
              specification: e.target.value,
              scopeVerified: false,
              scopeAcknowledged: false,
            })
          }
          placeholder="Enter readable specification"
        />
      </label>
      <label className="field">
        <span>Verified quantity</span>
        <NumberInput
          nullable
          value={draft.quantity}
          onChange={(n) =>
            setDraft({
              ...draft,
              quantity: Number.isNaN(n) ? null : n,
              scopeVerified: false,
              scopeAcknowledged: false,
            })
          }
        />
      </label>
      <label className="field">
        <span>Unit</span>
        <input
          aria-label="Edit unit"
          list="takeoff-units"
          value={draft.unit}
          onChange={(e) =>
            setDraft({
              ...draft,
              unit: e.target.value,
              scopeVerified: false,
              scopeAcknowledged: false,
            })
          }
        />
      </label>
      {needsStockLength(item) && (
        <label className="field">
          <span>Required stock length (ft)</span>
          <NumberInput
            nullable
            value={draft.stockLength}
            onChange={(n) =>
              setDraft({
                ...draft,
                stockLength: Number.isNaN(n) ? null : n,
                scopeVerified: false,
                scopeAcknowledged: false,
              })
            }
          />
        </label>
      )}
      <label className="field">
        <span>Include in quote</span>
        <select
          value={draft.included ? "Yes" : "No"}
          onChange={(e) =>
            setDraft({ ...draft, included: e.target.value === "Yes" })
          }
        >
          <option disabled={blocked}>Yes</option>
          <option>No</option>
        </select>
      </label>
      {scopeUncertain && (
        <label className="field">
          <span>Confirm work scope</span>
          <select
            value={draft.scope}
            onChange={(e) =>
              setDraft({
                ...draft,
                scope: e.target.value as typeof draft.scope,
                scopeVerified: false,
                included: false,
              })
            }
          >
            {[
              "New work",
              "Existing work to remain",
              "Existing work to remove or modify",
              "By others / excluded",
              "Requires scope confirmation",
              ...(item.workScope === "By others" ||
              item.workScope === "Existing work"
                ? [item.workScope]
                : []),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      {scopeNeedsVerification && !blocked && (
        <label className="check-options">
          <input
            type="checkbox"
            checked={draft.scopeVerified}
            onChange={(e) =>
              setDraft({
                ...draft,
                scopeVerified: e.target.checked,
                scopeAcknowledged: true,
              })
            }
          />
          I verified this work is included in our contract
        </label>
      )}
      {item.calculation && (
        <p className="tiny">
          Changing quantity/unit selects a manual estimate quantity. Changing
          stock length requires calculator verification again.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="quick-edit-actions">
        <button
          className="button"
          onClick={() => {
            try {
              if (JSON.stringify(original.current) !== JSON.stringify(item))
                throw new Error(
                  "This material changed. Cancel and reopen Edit to use the latest values.",
                );
              const delta = quickMaterialChanges(item, draft);
              if (Object.keys(delta).length) onSave(delta);
              onClose();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Save changes
        </button>
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button secondary"
          onClick={() => {
            if (
              window.confirm(
                "Open Advanced details? Unsaved quick edits will be discarded.",
              )
            )
              onAdvanced();
          }}
        >
          Advanced details
        </button>
      </div>
    </fieldset>
  );
}
