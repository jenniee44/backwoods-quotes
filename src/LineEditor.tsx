import { Plus, Trash2 } from "lucide-react";
import NumberInput from "./NumberInput";
import {
  categories,
  newLine,
  units,
  scopeGroups,
  linePrice,
  lineCost,
  purchaseQuantity,
  money,
} from "./model";
import type { Quote, Line, Kind } from "./model";
const F = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
export default function LineEditor({
  quote: q,
  kind,
  locked,
  onChange,
}: {
  quote: Quote;
  kind: Kind;
  locked: boolean;
  onChange: (lines: Line[]) => void;
}) {
  const patch = (line: Line) =>
    onChange(q.lines.map((l) => (l.id === line.id ? line : l)));
  return (
    <>
      <p className="muted">
        {kind === "Labour"
          ? "Internal cost and customer rate are separate. Labour hours stay private unless enabled."
          : kind === "Materials"
            ? "Required quantity + waste = purchase quantity. Markup applies to purchase cost; waste is not markup."
            : "Use 0% markup to pass through at cost, or override the full line selling price."}
      </p>
      <datalist id="construction-units">
        {units.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <datalist id="scope-groups">
        {scopeGroups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      {q.lines
        .filter((l) => l.kind === kind)
        .map((l) => (
          <fieldset className="line-card" key={l.id} disabled={locked}>
            <div className="line-title">
              <F label="Description *">
                <input
                  value={l.description}
                  onChange={(e) => patch({ ...l, description: e.target.value })}
                />
              </F>
              <button
                className="icon danger"
                aria-label={`Remove ${l.description || "line"}`}
                onClick={() => onChange(q.lines.filter((x) => x.id !== l.id))}
              >
                <Trash2 size={18} />
              </button>
            </div>
            <F label="Customer scope group (optional)">
              <input
                list="scope-groups"
                value={l.scopeGroup ?? ""}
                placeholder="Choose a group or enter your own"
                onChange={(e) => patch({ ...l, scopeGroup: e.target.value })}
              />
            </F>
            <div className="fields compact">
              <F
                label={
                  kind === "Labour"
                    ? "Estimated hours"
                    : kind === "Materials"
                      ? "Required quantity"
                      : "Quantity"
                }
              >
                <NumberInput
                  value={l.quantity}
                  onChange={(n) => patch({ ...l, quantity: n })}
                />
              </F>
              {kind !== "Labour" && (
                <F label="Unit">
                  <input
                    list="construction-units"
                    value={l.unit}
                    onChange={(e) => patch({ ...l, unit: e.target.value })}
                  />
                </F>
              )}
              {kind === "Materials" && (
                <>
                  <F label="Waste (%)">
                    <NumberInput
                      value={l.waste ?? 0}
                      onChange={(n) => patch({ ...l, waste: n })}
                    />
                  </F>
                  <F label="Purchase quantity (calculated)">
                    <output className="calculated-value">
                      {purchaseQuantity(l).toLocaleString("en-CA", {
                        maximumFractionDigits: 4,
                      })}{" "}
                      {l.unit}
                    </output>
                  </F>
                </>
              )}
              <F
                label={
                  kind === "Labour"
                    ? "Internal cost / hour ($)"
                    : "Unit cost ($)"
                }
              >
                <NumberInput
                  value={l.cost}
                  onChange={(n) => patch({ ...l, cost: n })}
                />
              </F>
              {kind === "Labour" ? (
                <F label="Customer rate / hour ($)">
                  <NumberInput
                    value={l.rate}
                    onChange={(n) => patch({ ...l, rate: n })}
                  />
                </F>
              ) : (
                <F label="Markup (%)">
                  <NumberInput
                    value={l.markup}
                    onChange={(n) => patch({ ...l, markup: n })}
                  />
                </F>
              )}
              {kind === "Other Costs" && (
                <F label="Category">
                  <select
                    value={l.category}
                    onChange={(e) => patch({ ...l, category: e.target.value })}
                  >
                    {[...new Set([...categories, l.category])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </F>
              )}
              <F label="Selling price override ($)">
                <NumberInput
                  nullable
                  placeholder="Automatic"
                  value={l.override}
                  onChange={(n) =>
                    patch({ ...l, override: Number.isNaN(n) ? null : n })
                  }
                />
              </F>
            </div>
            <div className="line-footer">
              <span>
                Internal cost <b>{money(lineCost(l))}</b>
              </span>
              <span>
                Calculated selling price{" "}
                <b>{money(linePrice({ ...l, override: null }))}</b>
              </span>
              <span>
                Customer price <b>{money(linePrice(l))}</b>
              </span>
            </div>
            {l.takeoffId && (
              <p className="tiny">
                Created from a contractor-reviewed takeoff item. Changes here do
                not change the takeoff source.
              </p>
            )}
          </fieldset>
        ))}
      {!q.lines.some((l) => l.kind === kind) && (
        <div className="empty-inline">No {kind.toLowerCase()} yet.</div>
      )}
      <button
        disabled={locked}
        className="button secondary"
        onClick={() => onChange([...q.lines, newLine(kind, q.pricing)])}
      >
        <Plus size={18} />
        Add{" "}
        {kind === "Labour"
          ? "labour"
          : kind === "Materials"
            ? "material"
            : "cost"}
      </button>
    </>
  );
}
