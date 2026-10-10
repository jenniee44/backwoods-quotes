import type { Quote, TakeoffItem } from "./model";
const norm = (s?: string) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function family(t: TakeoffItem) {
  if (t.destination !== "Materials") return "";
  const s = t.description;
  if (/hanger|connector|bracket|hardware/i.test(s)) return "hangers-connectors";
  if (/ledger.*(?:screw|bolt)|(?:screw|bolt).*ledger/i.test(s))
    return "ledger-fasteners";
  if (/flashing/i.test(s)) return "flashing";
  for (const [key, pattern] of Object.entries({
    footings:
      /footing|foundation.*(?:concrete|pier)|concrete.*(?:foundation|pier|pads?)/i,
    beams: /beam/i,
    posts: /\bposts?\b/i,
    joists: /joist/i,
    guards: /guard|railing/i,
  }))
    if (pattern.test(s)) return key;
  return "";
}
export function overlapKey(a: TakeoffItem, b: TakeoffItem) {
  return JSON.stringify(
    [a, b]
      .sort((x, y) => x.id.localeCompare(y.id))
      .map((t) => [
        t.id,
        t.description,
        t.specification,
        t.location,
        t.workScope,
        t.supportBasis,
        t.subcontractorBasis,
        t.quantity,
        t.unit,
        t.alternativeGroup,
        t.alternativeOption,
        t.calculation,
        t.documentId,
        t.page,
        t.sourceFacts,
        t.notes,
      ]),
  );
}
export function overlappingItems(q: Quote, item: TakeoffItem) {
  return q.takeoff.filter(
    (t) =>
      t.id !== item.id &&
      t.status !== "Rejected" &&
      t.included !== false &&
      family(item) &&
      family(item) === family(t),
  );
}
export function unresolvedOverlaps(q: Quote, item: TakeoffItem) {
  return overlappingItems(q, item).filter(
    (t) =>
      !(item.overlapReviews ?? []).includes(overlapKey(item, t)) &&
      !(t.overlapReviews ?? []).includes(overlapKey(item, t)),
  );
}
export function acknowledgeSeparate(
  q: Quote,
  a: TakeoffItem,
  b: TakeoffItem,
): Quote {
  const key = overlapKey(a, b);
  return {
    ...q,
    takeoff: q.takeoff.map((t) =>
      t.id === a.id || t.id === b.id
        ? {
            ...t,
            overlapReviews: [
              ...new Set([
                ...(t.overlapReviews ?? []).filter((review) =>
                  q.takeoff.some(
                    (peer) =>
                      peer.id !== t.id && overlapKey(t, peer) === review,
                  ),
                ),
                key,
              ]),
            ],
          }
        : t,
    ),
  };
}
export function consolidateCompared(
  q: Quote,
  a: TakeoffItem,
  b: TakeoffItem,
): Quote {
  if (
    a.convertedLineId ||
    b.convertedLineId ||
    a.status !== "Proposed" ||
    b.status !== "Proposed" ||
    !norm(a.specification) ||
    !norm(a.location) ||
    norm(a.specification) !== norm(b.specification) ||
    norm(a.location) !== norm(b.location) ||
    a.quantity !== b.quantity ||
    a.quantity === null ||
    norm(a.unit) !== norm(b.unit) ||
    a.workScope !== b.workScope ||
    a.supportBasis !== b.supportBasis ||
    a.subcontractorBasis !== b.subcontractorBasis ||
    a.included !== b.included ||
    a.alternativeGroup !== b.alternativeGroup ||
    a.alternativeOption !== b.alternativeOption ||
    JSON.stringify(a.calculation) !== JSON.stringify(b.calculation)
  )
    throw new Error(
      "Only unreviewed items with matching verified specifications, location, scope, method and quantity can be consolidated. Keep distinct assemblies separate.",
    );
  const facts = [
    ...new Set([
      ...(a.sourceFacts ?? []),
      ...(b.sourceFacts ?? []),
      `Compared source: ${b.documentId || "manual"}, page ${b.page ?? "unknown"}, detail ${b.sourceDetailView ?? "original"}; ${b.description}; ${b.notes}`,
    ]),
  ];
  if (facts.length > 20 || facts.some((f) => f.length > 1000))
    throw new Error(
      "Keep these items separate to preserve all source evidence.",
    );
  // Retain the complete second record as rejected evidence rather than erase it.
  return {
    ...q,
    takeoff: q.takeoff.map((t) =>
      t.id === a.id
        ? {
            ...a,
            sourceFacts: facts,
            warnings: [
              ...new Set([...(a.warnings ?? []), ...(b.warnings ?? [])]),
            ],
            assumptions: [
              ...new Set([...(a.assumptions ?? []), ...(b.assumptions ?? [])]),
            ],
            confidence: "Low",
            reviewAcknowledged: false,
            scopeVerified: false,
            ...(a.calculation
              ? {
                  calculation: { ...a.calculation, verified: false },
                  quantity: null,
                  classification: "Contractor input required" as const,
                  quantityMethod: "Unknown" as const,
                }
              : {}),
          }
        : t.id === b.id
          ? { ...b, status: "Rejected", reviewAcknowledged: false }
          : t,
    ),
  };
}
