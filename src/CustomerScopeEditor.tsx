import { customerScopesFor } from "./customerDocument";
import type { Quote, CustomerScope } from "./model";
export default function CustomerScopeEditor({
  quote,
  onChange,
}: {
  quote: Quote;
  onChange: (scopes: CustomerScope[]) => void;
}) {
  const scopes = customerScopesFor(quote);
  return (
    <details className="scope-editor">
      <summary>Customer scope sections</summary>
      <p className="muted">
        Edit the headings and included-work descriptions printed on the customer
        quote. Internal rows stay separate.
      </p>
      {scopes.length === 0 && (
        <p>Add estimate lines with customer scope groups to create sections.</p>
      )}
      {scopes.map((scope, i) => (
        <div className="line-card" key={i}>
          <label className="field">
            <span>Customer section heading</span>
            <input
              value={scope.label}
              onChange={(e) =>
                onChange(
                  scopes.map((s, j) =>
                    j === i ? { ...s, label: e.target.value } : s,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            <span>Included work description</span>
            <textarea
              rows={3}
              value={scope.description}
              onChange={(e) =>
                onChange(
                  scopes.map((s, j) =>
                    j === i ? { ...s, description: e.target.value } : s,
                  ),
                )
              }
            />
          </label>
          <small>Groups included: {scope.sourceGroups.join(", ")}</small>
        </div>
      ))}
    </details>
  );
}
