import type { Quote, TakeoffItem } from "./model";

/** Read-only material evidence view. It never converts observations to priced lines. */
export type MaterialEvidenceRow = {
  key: string;
  description: string;
  category: string;
  quantity: number | null;
  unit: string;
  status: TakeoffItem["status"];
  confidence: TakeoffItem["confidence"];
  source: string;
  needsReview: string[];
};

export function buildMaterialEvidence(q: Quote): MaterialEvidenceRow[] {
  // The saved takeoff is the authoritative reviewable index. Analysis reports
  // may repeat those observations and must not be summed with them.
  const seen = new Set<string>();
  const items = (q.takeoff ?? []).filter(item =>
    item.status !== "Rejected" &&
    (item.destination === "Materials" || (!item.destination && !!item.category))
  );
  const rows: MaterialEvidenceRow[] = [];
  for (const item of items) {
    const identity = item.analysisSourceKey || item.id;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const quantity = typeof item.quantity === "number" &&
      Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null;
    const needsReview: string[] = [];
    if (quantity === null) needsReview.push("Quantity missing");
    if (!item.purchaseVerified) needsReview.push("Purchase count unverified");
    if (!item.scopeVerified) needsReview.push("Scope unverified");
    if (!item.conflictsVerified) needsReview.push("Overlaps/conflicts unverified");
    if (item.status !== "Approved") needsReview.push("Not approved");
    if (item.warnings?.length) needsReview.push(...item.warnings.slice(0, 2));
    rows.push({
      key: item.id,
      description: item.description || item.specification || "Unidentified material",
      category: item.category || "Uncategorized",
      quantity,
      unit: item.unit || "unspecified",
      status: item.status,
      confidence: item.confidence,
      source: [item.sourceDocumentName || q.documents.find(d => d.id === item.documentId)?.name || "Saved analysis",
        item.page != null ? "page " + item.page : ""].filter(Boolean).join(", "),
      needsReview,
    });
  }
  return rows;
}
