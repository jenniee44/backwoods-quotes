import {
  estimateFor,
  linePrice,
  round,
  calculate,
  groupsFor,
  bathroomCustomerScopes,
  companyDefaults,
  responsibilityText,
  detailLabels,
} from "./model";
import type { Quote, CustomerScope } from "./model";
export type CustomerRow = {
  description: string;
  amount: number;
  scopeText?: string;
  quantities: string[];
};
// Only customer selling values are projected. Allocate internal additions in cents,
// with largest remainders so displayed scopes always reconcile exactly to subtotal.
export function customerRows(q: Quote): CustomerRow[] {
  const e = estimateFor(q),
    t = calculate(e);
  const rows: CustomerRow[] = [];
  const scopes = customerScopesFor(q);
  for (const l of e.lines) {
    const quantity =
      l.kind === "Labour"
        ? q.details.showLabourHours
        : q.details.showQuantities;
    const source = l.scopeGroup?.trim() || "Project Work";
    const scope = scopes.find((s) => s.sourceGroups.includes(source));
    const description = publicText(scope?.label ?? source) || "Project Work";
    const detail = quantity ? `${l.quantity} ${l.unit}` : "";
    const amount = linePrice(l, e.pricing);
    if (!amount) continue;
    const existing = rows.find((r) => r.description === description);
    if (existing) {
      existing.amount = round(existing.amount + amount);
      if (detail) existing.quantities.push(detail);
    } else
      rows.push({
        description,
        scopeText: publicText(scope?.description ?? ""),
        amount,
        quantities: detail ? [publicText(detail)] : [],
      });
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
  return rows.filter((row) => row.amount > 0 && row.description.trim());
}

// Never use private descriptions as automatic customer scope text.
export function customerScopesFor(q: Quote): CustomerScope[] {
  const configured =
    q.customerScopes ??
    (q.appliedTemplateIds?.includes("bathroom") ||
    q.templateCategory === "Bathroom Renovation"
      ? bathroomCustomerScopes
      : []);
  const uncovered = groupsFor(q).filter(
    (group) => !configured.some((scope) => scope.sourceGroups.includes(group)),
  );
  return [
    ...configured,
    ...uncovered.map((group) => ({
      label: group,
      description: "",
      sourceGroups: [group],
    })),
  ];
}
export function publicText(text: string): string {
  return text
    .split("\n")
    .filter(
      (line) =>
        !/leave blank as (a |an )?(company )?default|we can eventually create|developer instructions/i.test(
          line,
        ),
    )
    .join("\n")
    .trim();
}
// Explicit public allowlist. Renderer receives no internal costs, profiles, notes,
// supplier details, raw estimate rows or takeoff data.
export function customerDocument(q: Quote) {
  const t = calculate(estimateFor(q));
  const company = q.company ?? companyDefaults;
  return {
    number: q.number,
    date: q.date,
    expiry: q.expiry,
    name: publicText(q.name),
    projectAddress: publicText(q.customer.address),
    scope: publicText(q.description),
    customer: {
      name: publicText(q.customer.name),
      address: publicText(q.customer.mailingAddress ?? ""),
      email: q.customer.email,
      phone: q.customer.phone,
    },
    company: {
      name: publicText(company.name),
      address: publicText(company.address),
      phone: company.phone,
      email: company.email,
    },
    rows: customerRows(q),
    subtotal: t.subtotal,
    tax: t.tax,
    total: t.total,
    hst: estimateFor(q).pricing.hst,
    sections: [
      { label: "Terms & Conditions", text: publicText(q.terms) },
      ...Object.entries(detailLabels)
        .filter(([key]) => key !== "terms")
        .map(([key, label]) => {
          const text = publicText(q.details[key as keyof typeof detailLabels]);
          return {
            label: key === "changeOrders" ? "Change-Order Terms" : label,
            text:
              key === "permits" || key === "engineering"
                ? responsibilityText(key, text)
                : text,
          };
        }),
    ].filter((section) => section.text),
  };
}
