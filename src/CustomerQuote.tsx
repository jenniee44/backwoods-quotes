import { ArrowLeft, Printer, TreePine } from "lucide-react";
import { money, paymentError } from "./model";
import { customerDocument } from "./customerDocument";
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
  const doc = customerDocument(q);
  const paymentProblem = paymentError(q.details.payment);
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
          <option value="Simplified">Summary</option>
          <option>Detailed</option>
        </select>
        <button
          className="button"
          disabled={!!paymentProblem}
          onClick={() => {
            (document.activeElement as HTMLElement)?.blur();
            window.print();
          }}
        >
          <Printer size={17} /> Print / Save PDF
        </button>
      </div>
      <div className="preview-options check-options">
        {(["showQuantities", "showLabourHours"] as const).map((k) => (
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
        ))}
      </div>
      {paymentProblem && (
        <p className="preview-options error" role="alert">
          {paymentProblem}
        </p>
      )}
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
            <p>{doc.number}</p>
          </div>
        </header>
        <div className="document-meta">
          <div>
            <h3>PREPARED FOR</h3>
            <b>{doc.customer.name}</b>
            {doc.customer.address && <p>{doc.customer.address}</p>}
            {doc.customer.email && <p>{doc.customer.email}</p>}
            {doc.customer.phone && <p>{doc.customer.phone}</p>}
          </div>
          <div>
            <p>
              <b>Quote date</b> {doc.date}
            </p>
            {doc.expiry && (
              <p>
                <b>Valid until</b> {doc.expiry}
              </p>
            )}
          </div>
        </div>
        <h2>{doc.name}</h2>
        {doc.projectAddress && (
          <p>
            <b>Project address</b> {doc.projectAddress}
          </p>
        )}
        {(doc.company.name ||
          doc.company.address ||
          doc.company.phone ||
          doc.company.email) && (
          <p className="company-contact">
            {[
              doc.company.name,
              doc.company.address,
              doc.company.phone,
              doc.company.email,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <h3>SCOPE OF WORK</h3>
        <p className="scope">{doc.scope || doc.name}</p>
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
                <td>{doc.name}</td>
                <td>{money(doc.subtotal)}</td>
              </tr>
            ) : (
              <>
                {doc.rows.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <b>{l.description}</b>
                      {l.scopeText && <p className="scope">{l.scopeText}</p>}
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
            <b>{money(doc.subtotal)}</b>
          </div>
          <div>
            <span>HST ({doc.hst}%)</span>
            <b>{money(doc.tax)}</b>
          </div>
          <div className="total">
            <span>Total (CAD)</span>
            <b>{money(doc.total)}</b>
          </div>
        </div>
        {doc.sections.map((section) => (
          <section className="document-terms" key={section.label}>
            <h3>{section.label.toUpperCase()}</h3>
            <p>{section.text}</p>
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
