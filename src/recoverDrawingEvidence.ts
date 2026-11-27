import type { Quote, TakeoffItem } from "./model";

export function matchingDrawingObservations(target: Quote, source: Quote) {
  if (target.status !== "Draft" || target.job || target.id === source.id)
    throw new Error("Recovery requires a separate editable draft.");
  const matchesForReview: {
    item: TakeoffItem;
    document: Quote["documents"][number];
    key: string;
    analysisDate?: string;
  }[] = [];
  const seen = [...target.takeoff];
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
      seen.some(
        (t) =>
          t.analysisSourceKey === key ||
          (t.documentId === doc.id &&
            t.page === item.page &&
            observationName(t.description) ===
              observationName(item.description)),
      )
    )
      continue;
    const reports = source.analysisReports ?? [];
    const matchingReports = reports.filter((report) =>
      item.analysisId
        ? report.id === item.analysisId
        : report.sourceDocuments?.some(
            (document) => document.id === item.documentId,
          ),
    );
    matchesForReview.push({
      item,
      document: doc,
      key,
      analysisDate:
        matchingReports.length === 1 ? matchingReports[0].createdAt : undefined,
    });
    seen.push({ ...item, documentId: doc.id, analysisSourceKey: key });
  }
  return matchesForReview;
}

function observationName(description: string): string {
  return description.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Recover observations only. Source reports and estimate lines stay intact. */
export function recoverDrawingEvidence(target: Quote, source: Quote): Quote {
  const recovered: TakeoffItem[] = matchingDrawingObservations(
    target,
    source,
  ).map(({ item, document, key }) => ({
    id: crypto.randomUUID(),
    description: item.description,
    quantity: null,
    unit: item.unit,
    documentId: document.id,
    sourceDocumentName: document.name,
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
  }));
  return recovered.length
    ? { ...target, takeoff: [...target.takeoff, ...recovered] }
    : target;
}
