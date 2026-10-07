import UnitInput from "./UnitInput";
import { Plus, Trash2 } from "lucide-react";
import NumberInput from "./NumberInput";
import {
  categories,
  newLine,
  units,
  groupsFor,
  effectiveLine,
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
  onGroup,
}: {
  quote: Quote;
  kind: Kind;
  locked: boolean;
  onChange: (lines: Line[]) => void;
  onGroup: (group: string) => void;
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
        {groupsFor(q).map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      {q.lines
        .filter((l) => l.kind === kind)
        .map((stored) => {
          const l = effectiveLine(stored, q.pricing);
          const allowance =
            kind === "Other Costs" &&
            l.unit === "allowance" &&
            (l.quantity === 1 || (l.quantity === 0 && l.cost === 0));
          return (
            <fieldset className="line-card" key={l.id} disabled={locked}>
              <div className="line-title">
                <F label="Description *">
                  <input
                    value={l.description}
                    onChange={(e) =>
                      patch({ ...l, description: e.target.value })
                    }
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
                <UnitInput
                  value={l.scopeGroup ?? ""}
                  label="Customer scope group (optional)"
                  options={groupsFor(q)}
                  hint="Type a custom customer scope group."
                  onChange={(scopeGroup) => patch({ ...l, scopeGroup })}
                  onBlur={() => {
                    if (l.scopeGroup?.trim()) onGroup(l.scopeGroup.trim());
                  }}
                />
              </F>
              <div className="check-options">
                {(kind === "Labour"
                  ? ["inheritCost", "inheritRate"]
                  : ["inheritMarkup"]
                ).map((key) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={!!stored[key as keyof Line]}
                      onChange={(e) => patch({ ...l, [key]: e.target.checked })}
                    />
                    {key === "inheritCost"
                      ? "Use quote internal labour cost"
                      : key === "inheritRate"
                        ? "Use quote customer labour rate"
                        : "Use quote markup"}
                    {stored[key as keyof Line]
                      ? " (default)"
                      : " (line override)"}
                  </label>
                ))}
              </div>
              {kind === "Other Costs" && (
                <F label="Entry method">
                  <select
                    value={allowance ? "allowance" : "quantity"}
                    onChange={(e) =>
                      patch(
                        e.target.value === "allowance"
                          ? {
                              ...l,
                              unit: "allowance",
                              quantity: 1,
                              cost: lineCost(l),
                            }
                          : {
                              ...l,
                              unit: l.unit === "allowance" ? "each" : l.unit,
                            },
                      )
                    }
                  >
                    <option value="allowance">Amount / allowance</option>
                    <option value="quantity">Quantity × unit cost</option>
                  </select>
                </F>
              )}
              <div className="fields compact">
                {!allowance && (
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
                )}
                {kind !== "Labour" && !allowance && (
                  <F label="Unit">
                    <UnitInput
                      value={l.unit}
                      onChange={(unit) => patch({ ...l, unit })}
                    />
                  </F>
                )}
                {kind === "Materials" && (
                  <>
                    <F label="Waste (%)">
                      <NumberInput
                        step="1"
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
                      : allowance
                        ? "Estimated cost ($)"
                        : "Unit cost ($)"
                  }
                >
                  <NumberInput
                    step={kind === "Labour" ? "1" : "0.01"}
                    value={l.cost}
                    onChange={(n) =>
                      patch({
                        ...l,
                        cost: n,
                        ...(allowance ? { quantity: 1 } : {}),
                        inheritCost: false,
                      })
                    }
                  />
                </F>
                {kind === "Labour" ? (
                  <F label="Customer rate / hour ($)">
                    <NumberInput
                      step="1"
                      value={l.rate}
                      onChange={(n) =>
                        patch({ ...l, rate: n, inheritRate: false })
                      }
                    />
                  </F>
                ) : (
                  <F label="Markup (%)">
                    <NumberInput
                      step="1"
                      value={l.markup}
                      onChange={(n) =>
                        patch({ ...l, markup: n, inheritMarkup: false })
                      }
                    />
                  </F>
                )}
                {kind === "Other Costs" && (
                  <F label="Category">
                    <select
                      aria-label="Category"
                      value={l.category}
                      onChange={(e) =>
                        patch({
                          ...l,
                          category: e.target.value,
                          ...(categories.slice(0, 10).includes(e.target.value)
                            ? { unit: "allowance" }
                            : {}),
                        })
                      }
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
              {kind === "Materials" && (
                <details>
                  <summary>Internal material details</summary>
                  <div className="fields">
                    <F label="Supplier (private)">
                      <input
                        value={l.supplier ?? ""}
                        onChange={(e) =>
                          patch({ ...l, supplier: e.target.value })
                        }
                      />
                    </F>
                    <F label="SKU / product number (private)">
                      <input
                        value={l.sku ?? ""}
                        onChange={(e) => patch({ ...l, sku: e.target.value })}
                      />
                    </F>
                  </div>
                  <F label="Material notes (private)">
                    <textarea
                      value={l.materialNotes ?? ""}
                      onChange={(e) =>
                        patch({ ...l, materialNotes: e.target.value })
                      }
                    />
                  </F>
                </details>
              )}
              {kind === "Other Costs" &&
                /coordination/i.test(l.description) && (
                  <p className="tiny">
                    Use this for a real project cost only. General overhead and
                    profit recovery belong in Pricing; entering both can
                    duplicate recovery.
                  </p>
                )}
              {l.takeoffSource && (
                <>
                  <p className="tiny">
                    Source: {l.takeoffSource.documentName}
                    {l.takeoffSource.page
                      ? ` — Page ${l.takeoffSource.page}`
                      : ""}{" "}
                    · approved {l.takeoffSource.quantity} {l.takeoffSource.unit}
                  </p>
                  <details className="takeoff-evidence">
                    <summary>
                      Approved takeoff evidence (private snapshot)
                    </summary>
                    <p>
                      {l.takeoffSource.classification} ·{" "}
                      {l.takeoffSource.confidence} confidence
                    </p>
                    {l.takeoffSource.specification && (
                      <p>Specification: {l.takeoffSource.specification}</p>
                    )}
                    {l.takeoffSource.location && (
                      <p>Location: {l.takeoffSource.location}</p>
                    )}
                    {!!l.takeoffSource.sourceFacts?.length && (
                      <ul>
                        {l.takeoffSource.sourceFacts.map((fact, i) => (
                          <li key={i}>{fact}</li>
                        ))}
                      </ul>
                    )}
                    {l.takeoffSource.calculationBasis && (
                      <p>
                        Calculation basis: {l.takeoffSource.calculationBasis}
                      </p>
                    )}
                    {!!l.takeoffSource.assumptions?.length && (
                      <p>
                        Assumptions: {l.takeoffSource.assumptions.join("; ")}
                      </p>
                    )}
                    {!!l.takeoffSource.warnings?.length && (
                      <p>Verification: {l.takeoffSource.warnings.join("; ")}</p>
                    )}
                    {l.takeoffSource.notes && (
                      <p>Source notes: {l.takeoffSource.notes}</p>
                    )}
                  </details>
                </>
              )}
              {l.pricingRequired && lineCost(l) === 0 && (
                <p className="margin-warning">
                  Pricing required — enter your own cost/rates. AI did not
                  supply business prices.
                </p>
              )}
              {l.takeoffId && (
                <p className="tiny">
                  Created from a contractor-reviewed takeoff item. Changes here
                  do not change the takeoff source.
                </p>
              )}
            </fieldset>
          );
        })}
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
