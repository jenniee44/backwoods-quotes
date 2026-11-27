import type { Quote, TakeoffItem } from "./model";

/** Recover observations only, never pricing, approvals or calculated quantities.
 * Original reports remain on the source quote. No network or AI calls.
 */
export function recoverDrawingEvidence(target: Quote, source: Quote): Quote {
  if (target.status !== "Draft" || target.job || target.id === source.id)
    throw new Error("Recovery requires a separate editable draft.");
  const recovered: TakeoffItem[] = [];
  for (const item of source.takeoff) {
    if (item.origin !== "ai" || item.status === "Rejected") continue;
    const originals = source.documents.filter((d) => d.id === item.documentId);
    if (originals.length !== 1) continue;
    const original = originals[0];
    if (!original?.data) continue;
    const matches = target.documents.filter(
      (d) => d.type === original.type && d.data === original.data,
    );
    if (matches.length !== 1) continue;
    const doc = matches[0];
    if (target.documents.filter((d) => d.id === doc.id).length !== 1) continue;
    const key = "recovered:" + source.id + ":" + item.id;
    if (
      [...target.takeoff, ...recovered].some(
        (t) =>
          t.analysisSourceKey === key ||
          (t.documentId === doc.id &&
            t.page === item.page &&
            t.description.trim().toLowerCase() ===
              item.description.trim().toLowerCase()),
      )
    )
      continue;
    // Explicit allowlist: do not carry stale nested document IDs, assembly calculations,
    // approval flags, converted line IDs or source report IDs into the new quote.
    recovered.push({
      id: crypto.randomUUID(),
      description: item.description,
      quantity: null,
      unit: item.unit,
      documentId: doc.id,
      sourceDocumentName: doc.name,
      page: item.page,
      notes:
        item.notes +
        "\nRecovered from " +
        source.number +
        "; verify against original drawing.",
      status: "Proposed",
      confidence: item.confidence,
      origin: "ai",
      analysisSourceKey: key,
      classification: "Contractor input required",
      assumptions: [...(item.assumptions ?? [])],
      warnings: [
        ...(item.warnings ?? []),
        "Recovered observation only. Recheck scope, dimensions and quantities before approval.",
      ],
      scopeVerified: false,
      reviewAcknowledged: false,
    });
  }
  return recovered.length
    ? { ...target, takeoff: [...target.takeoff, ...recovered] }
    : target;
}
