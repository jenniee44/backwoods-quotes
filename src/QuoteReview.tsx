import { useState } from "react";
import { reviewWarnings, calculate, money } from "./model";
import type { Quote } from "./model";
export default function QuoteReview({
  quote,
  onClose,
  onSend,
}: {
  quote: Quote;
  onClose: () => void;
  onSend: () => void;
}) {
  const warnings = reviewWarnings(quote);
  const [ack, setAck] = useState(false);
  return (
    <div className="review-overlay">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Quote review checklist"
        className="panel review-card"
      >
        <h2>Review before sending</h2>
        <p className="muted">
          {quote.number} · {money(calculate(quote).total)} including HST.
          Sending locks this estimate. Duplicate it to make future revisions.
        </p>
        {warnings.length ? (
          <>
            <ul className="warning-list">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <label className="check-options">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I reviewed these warnings and choose to send this quote.
            </label>
          </>
        ) : (
          <p className="notice">
            All checklist items present. Review the scope and pricing with care.
          </p>
        )}
        <p className="tiny">
          This records Sent status. It does not email the customer.
        </p>
        <div className="heading-actions">
          <button className="button secondary" onClick={onClose}>
            Back to edit
          </button>
          <button
            className="button"
            disabled={warnings.length > 0 && !ack}
            onClick={onSend}
          >
            Confirm & mark sent
          </button>
        </div>
      </section>
    </div>
  );
}
