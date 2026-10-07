import { estimateFor, linePrice, round, calculate } from "./model";
import type { Quote } from "./model";
export type CustomerRow = {
  description: string;
  amount: number;
  quantities: string[];
};
// Only customer selling values are projected. Allocate internal additions in cents,
// with largest remainders so displayed scopes always reconcile exactly to subtotal.
export function customerRows(q: Quote): CustomerRow[] {
  const e = estimateFor(q),
    t = calculate(e);
  const rows: CustomerRow[] = [];
  for (const l of e.lines) {
    const quantity =
      l.kind === "Labour"
        ? q.details.showLabourHours
        : q.details.showQuantities;
    const description = q.details.groupLines
      ? l.scopeGroup?.trim() || "Project Work"
      : l.description || "Project Work";
    const detail = quantity
      ? `${q.details.groupLines ? `${l.description}: ` : ""}${l.quantity} ${l.unit}`
      : "";
    const amount = linePrice(l, e.pricing);
    const existing = q.details.groupLines
      ? rows.find((r) => r.description === description)
      : undefined;
    if (existing) {
      existing.amount = round(existing.amount + amount);
      if (detail) existing.quantities.push(detail);
    } else
      rows.push({ description, amount, quantities: detail ? [detail] : [] });
  }
  const additions = Math.round(
    (t.overhead + (q.details.exposeContingency ? 0 : t.contingency)) * 100,
  );
  if (!rows.length && additions)
    rows.push({ description: "Project Work", amount: 0, quantities: [] });
  const shares = rows.map((r, i) => {
    const exact = t.base ? (additions * r.amount) / t.base : 0;
    return { i, cents: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remaining = additions - shares.reduce((s, r) => s + r.cents, 0);
  for (const share of [...shares].sort((a, b) => b.fraction - a.fraction)) {
    if (remaining > 0) {
      share.cents++;
      remaining--;
    }
  }
  shares.forEach(
    (s) => (rows[s.i].amount = round(rows[s.i].amount + s.cents / 100)),
  );
  if (q.details.exposeContingency && t.contingency)
    rows.push({
      description: "Contingency allowance",
      amount: t.contingency,
      quantities: [],
    });
  return rows;
}
