import { evidenceScope } from "../shared/componentIdentity";
import { materialCategoryFor } from "../shared/takeoff";
import type { Quote, TakeoffItem } from "./model";
export const scopeDecisions = [
  "Included",
  "Excluded",
  "Existing to Remain",
  "Subcontracted",
] as const;
export type ScopeDecision = (typeof scopeDecisions)[number];
export function scopeReviewItems(q: Quote): TakeoffItem[] {
  const items = [...q.takeoff];
  for (const report of q.analysisReports ?? [])
    for (const [index, source] of (report.sourceObservations ?? []).entries()) {
      if (
        !materialCategoryFor(source) ||
        items.some(
          (t) =>
            t.documentId === source.documentId &&
            ((t.page === source.page &&
              t.description === source.description &&
              t.specification === source.specification) ||
              (!!source.assemblyReference &&
                t.assemblyReference === source.assemblyReference)),
        )
      )
        continue;
      items.push({
        ...structuredClone(source),
        id: `${report.id}:scope-source:${index}`,
        analysisId: report.id,
        origin: "ai",
        status: "Proposed",
        destination: "Informational",
        included: false,
        workScope: evidenceScope(source),
        reviewAcknowledged: false,
        scopeVerified: false,
      });
    }
  return items;
}
export function applyScopeOverride(
  q: Quote,
  id: string,
  choice: ScopeDecision,
): Quote {
  if (q.status !== "Draft" || q.job)
    throw new Error("Only an editable draft can change takeoff scope.");
  if (!scopeDecisions.includes(choice))
    throw new Error("Choose a valid quote scope.");
  const item = scopeReviewItems(q).find((t) => t.id === id);
  if (!item) throw new Error("This drawing item could not be located.");
  if (item.convertedLineId)
    throw new Error(
      "This item is already in the estimate. Review its estimate line separately.",
    );
  const originalScope = item.originalScope ?? {
    workScope: item.workScope,
    included: item.included,
    destination: item.destination,
    itemRole: item.itemRole,
  };
  const excluded = choice === "Excluded",
    existing = choice === "Existing to Remain";
  const patch: Partial<TakeoffItem> = {
    scopeOverride: choice,
    originalScope,
    workScope: existing
      ? "Existing work to remain"
      : excluded
        ? "By others / excluded"
        : "New work",
    included: !excluded && !existing,
    scopeVerified: true,
    destination:
      choice === "Subcontracted"
        ? "Subcontractor"
        : existing || excluded
          ? "Informational"
          : originalScope.destination === "Labour" ||
              originalScope.destination === "Other Costs"
            ? originalScope.destination
            : "Materials",
    itemRole:
      existing || excluded ? "Document observation" : "Construction item",
    status: excluded ? "Rejected" : "Proposed",
    reviewAcknowledged: false,
    purchaseVerified: false,
    conflictsVerified: false,
    ...(choice === "Subcontracted" ? { category: "Other Subcontractor" } : {}),
    ...(item.calculation
      ? { calculation: { ...item.calculation, verified: false } }
      : {}),
  };
  return {
    ...q,
    takeoff: q.takeoff.some((t) => t.id === id)
      ? q.takeoff.map((t) => (t.id === id ? { ...t, ...patch } : t))
      : [...q.takeoff, { ...item, ...patch }],
  };
}
