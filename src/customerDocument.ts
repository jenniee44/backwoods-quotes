import { estimateFor, linePrice, round } from "./model";
import type { Quote } from "./model";
export type CustomerRow = {
  description: string;
  amount: number;
  quantities: string[];
};
// Deliberate projection: no unit costs, markup, waste, hourly rates, notes or margins.
export function customerRows(q: Quote): CustomerRow[] {
  const lines = estimateFor(q).lines;
  const rows: CustomerRow[] = [];
  for (const l of lines) {
    const quantity =
      l.kind === "Labour"
        ? q.details.showLabourHours
        : q.details.showQuantities;
    const description = q.details.groupLines
      ? l.scopeGroup || l.description || "Project Costs"
      : l.description || "Project work";
    const detail = quantity
      ? `${q.details.groupLines ? `${l.description}: ` : ""}${l.quantity} ${l.unit}`
      : "";
    const existing = q.details.groupLines
      ? rows.find((r) => r.description === description)
      : undefined;
    if (existing) {
      existing.amount = round(existing.amount + linePrice(l));
      if (detail) existing.quantities.push(detail);
    } else
      rows.push({
        description,
        amount: linePrice(l),
        quantities: detail ? [detail] : [],
      });
  }
  return rows;
}
