import { ArrowLeft, Printer, TreePine } from "lucide-react";
import {
  calculate,
  estimateFor,
  money,
  detailLabels,
  responsibilityText,
} from "./model";
import { customerRows } from "./customerDocument";
import type { Quote, QuoteDetails } from "./model";

export default function CustomerQuote({
  quote: q,
  onClose,
  onMode,
  onDetails,
}: {
  quote: Quote;
  onClose: () => void;
  onMode: (mode: Quote["mode"]) => void;
  onDetails: (details: QuoteDetails) => void;
}) {
  const e = estimateFor(q),
    t = calculate(e);
  const customerLines = customerRows(q);
  return (
    <div className="preview-overlay">
      <div className="preview-toolbar">
        <button className="button secondary" onClick={onClose}>
          <ArrowLeft size={16} /> Back to editor
        </button>
        <select
          aria-label="Customer quote mode"
          value={q.mode}
          onChange={(e) => onMode(e.target.value as Quote["mode"])}
        >
          <option>Simplified</option>
          <option>Detailed</option>
        </select>
        <button className="button" onClick={() => window.print()}>
          <Printer size={17} /> Print / Save PDF
        </button>
      </div>
      <div className="preview-options check-options">
        {(["showQuantities", "showLabourHours", "groupLines"] as const).map(
          (k) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={q.details[k]}
                onChange={(e) =>
                  onDetails({ ...q.details, [k]: e.target.checked })
                }
              />
              {k === "showQuantities"
                ? "Show quantities"
                : k === "showLabourHours"
                  ? "Show labour hours"
                  : "Group by scope"}
            </label>
          ),
        )}
      </div>
      <article className="customer-document">
        <header className="document-header">
          <div className="document-brand">
            <TreePine size={40} />
            <div>
              BACKWOODS<small>BUILDING & MAINTENANCE</small>
            </div>
          </div>
          <div>
            <h1>PROJECT QUOTE</h1>
            <p>{q.number}</p>
          </div>
        </header>
        <div className="document-meta">
          <div>
            <h3>PREPARED FOR</h3>
            <b>{q.customer.name}</b>
            <p>{q.customer.address}</p>
            <p>{q.customer.email}</p>
            <p>{q.customer.phone}</p>
          </div>
          <div>
            <p>
              <b>Quote date</b> {q.date}
            </p>
            {q.expiry && (
              <p>
                <b>Valid until</b> {q.expiry}
              </p>
            )}
          </div>
        </div>
        <h2>{q.name}</h2>
        <h3>SCOPE OF WORK</h3>
        <p className="scope">{q.description || q.name}</p>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {q.mode === "Simplified" ? (
              <tr>
                <td>{q.name}</td>
                <td>{money(t.subtotal)}</td>
              </tr>
            ) : (
              <>
                {customerLines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.description}
                      {l.quantities.map((text, j) => (
                        <small key={j}>{text}</small>
                      ))}
                    </td>
                    <td>{money(l.amount)}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
        <div className="document-totals">
          <div>
            <span>Subtotal</span>
            <b>{money(t.subtotal)}</b>
          </div>
          <div>
            <span>HST ({e.pricing.hst}%)</span>
            <b>{money(t.tax)}</b>
          </div>
          <div className="total">
            <span>Total (CAD)</span>
            <b>{money(t.total)}</b>
          </div>
        </div>
        <section className="document-terms">
          <h3>TERMS & CONDITIONS</h3>
          <p>{q.terms}</p>
        </section>
        {(Object.keys(detailLabels) as (keyof typeof detailLabels)[])
          .filter((k) => k !== "terms" && q.details[k].trim())
          .map((k) => (
            <section className="document-terms" key={k}>
              <h3>{detailLabels[k].toUpperCase()}</h3>
              <p>
                {k === "permits" || k === "engineering"
                  ? responsibilityText(k, q.details[k])
                  : q.details[k]}
              </p>
            </section>
          ))}
        <section className="acceptance">
          <h3>ACCEPTANCE</h3>
          <p>I accept the scope of work and pricing outlined above.</p>
          <div>
            <span>Customer signature</span>
            <span>Date</span>
          </div>
        </section>
        <footer>
          Thank you for choosing Backwoods Building & Maintenance.
        </footer>
      </article>
    </div>
  );
}
