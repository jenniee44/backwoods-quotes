import { useState } from "react";
import type { Quote } from "./model";
import { applyDeckReplacementScope } from "./deckReplacementScope";
export default function DeckReplacementScope({
  quote,
  locked,
  onApply,
  onError,
}: {
  quote: Quote;
  locked: boolean;
  onApply: (q: Quote) => void;
  onError: (s: string) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <details className="deck-replacement-scope">
      <summary>Deck replacement — confirm the work included</summary>
      <p>
        Replace the wooden deck, framing, deck boards, wood railings and stairs.
        Retain existing steel and its supporting posts. Include subcontracted
        helical piles, demolition labour and a disposal bin. Drawing
        requirements stay unchanged; engineering acceptance is still required.
      </p>
      <label className="check-options">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={locked}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        This is my confirmed project scope. Add unresolved required materials
        for review; do not approve or price them.
      </label>
      <button
        type="button"
        disabled={locked || !confirmed}
        onClick={() => {
          try {
            onApply(applyDeckReplacementScope(quote, confirmed));
            onError("");
            setConfirmed(false);
          } catch (e) {
            onError((e as Error).message);
          }
        }}
      >
        Prepare deck replacement list
      </button>
    </details>
  );
}
