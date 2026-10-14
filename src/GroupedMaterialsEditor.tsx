import type { Quote, TakeoffItem } from "./model";
import { purchasingGroups } from "./purchasingGroups";
import { includedScope } from "./takeoffScope";
export default function GroupedMaterialsEditor({
  quote: q,
  items,
  renderItem,
  onReview,
}: {
  quote: Quote;
  items: TakeoffItem[];
  renderItem: (t: TakeoffItem) => React.ReactNode;
  onReview: (id: string) => void;
}) {
  const groups = purchasingGroups(q, items);
  return (
    <table className="materials-summary-table grouped-materials-editor">
      <caption className="sr-only">Grouped materials</caption>
      <thead>
        <tr>
          {[
            "Material",
            "Specification",
            "Quantity",
            "Unit",
            "Include / Exclude",
            "Status",
          ].map((label) => (
            <th key={label}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const t = group.items[0];
          const allApproved = group.items.every((i) => i.status === "Approved");
          const allAdded = group.items.every((i) => !!i.convertedLineId);
          return (
            <tr key={t.id} className="material-category-row">
              <td colSpan={6}>
                <details className="summary-material-category">
                  <summary aria-label={"Edit assemblies: " + t.id}>
                    <span className="material-category-grid">
                      <strong>{group.name}</strong>
                      <span
                        className="purchasing-specification"
                        title={t.specification}
                      >
                        {t.specification || "To confirm"}
                      </span>
                      <span>
                        {group.quantity === null
                          ? "To confirm"
                          : Number(group.quantity.toPrecision(8))}
                      </span>
                      <span>{group.quantity === null ? "—" : group.unit}</span>
                      <span>
                        {group.items.every(includedScope)
                          ? "Included"
                          : "Scope to confirm"}
                      </span>
                      <span>
                        {allAdded
                          ? "Added to estimate"
                          : allApproved
                            ? "Approved"
                            : group.quantity === null
                              ? "Needs review"
                              : "Calculated / verified"}
                        <button
                          type="button"
                          className="button secondary"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onReview(t.id);
                          }}
                        >
                          Review details
                        </button>
                      </span>
                    </span>
                  </summary>
                  <p className="tiny">{group.reason}</p>
                  <p className="tiny">
                    {group.items.length} separate record(s). Edit and approve
                    each assembly; quantities are never added by grouping.
                  </p>
                  <table className="materials-summary-table assembly-editor">
                    <caption className="sr-only">
                      Assemblies for {group.name}
                    </caption>
                    <tbody>{group.items.map(renderItem)}</tbody>
                  </table>
                </details>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
