import type { AnalysisSuggestion } from "./analysis";
import type { MaterialInput } from "./materialInputs";
import { evidenceScope } from "./componentIdentity";

function drawingAssembly(item: AnalysisSuggestion) {
  const references = new Set<string>();
  for (const fact of item.sourceFacts ?? []) {
    if (/proposed|assum|uncertain|unreadable|example/i.test(fact)) continue;
    for (const match of fact.matchAll(
      /\b(?:joist layout|drawing assembly|drawing label)\s*[:#]?\s+([A-Z][A-Z0-9-]*\d[A-Z0-9-]*|\d+)\b/gi,
    ))
      references.add(match[1].toUpperCase());
  }
  return references.size === 1 ? [...references][0] : null;
}
/** An explicit unique drawing-assembly reference can associate a dimension record
 * whose description/specification is the measurement rather than the lumber.
 * Proximity, label frequency and an unassociated overall dimension cannot.
 */
export function explicitlyAssociatedInputs(
  item: AnalysisSuggestion,
  candidates: AnalysisSuggestion[],
  dimensions: AnalysisSuggestion[],
): MaterialInput[] {
  const reference = drawingAssembly(item);
  if (
    !reference ||
    candidates.filter(
      (peer) =>
        peer.documentId === item.documentId &&
        peer.page === item.page &&
        drawingAssembly(peer) === reference &&
        peer.itemRole !== "Supporting evidence" &&
        peer.itemRole !== "Document observation",
    ).length !== 1
  )
    return [];
  return dimensions.flatMap((dimension) => {
    if (
      uncertainDimensionAssociation(dimension) ||
      dimension.documentId !== item.documentId ||
      dimension.page !== item.page ||
      item.page === null ||
      drawingAssembly(dimension) !== reference ||
      /uncertain|unreadable|not associated|association.*(?:unknown|confirm)|overall.*(?:unassociated|uncertain)/i.test(
        [dimension.calculationBasis, dimension.notes].join(" "),
      ) ||
      ([
        "Existing work to remain",
        "By others / excluded",
        "Existing work to remove or modify",
      ].includes(evidenceScope(dimension)) &&
        evidenceScope(dimension) !== evidenceScope(item))
    )
      return [];
    return (dimension.materialInputs ?? []).filter(
      (fact) =>
        fact.readable &&
        fact.page === item.page &&
        !/uncertain|unreadable|assum|scaled|pixel/i.test(fact.evidence) &&
        // Require the actual spacing-axis association, not merely a deck dimension.
        (fact.field !== "layoutLength" ||
          !/joist/i.test(item.description) ||
          /perpendicular to (?:the )?joists|across (?:the )?joists|joist spacing axis/i.test(
            fact.evidence,
          )) &&
        // Stock/cutting/waste preferences are not general drawing dimensions.
        !["stock", "waste", "pieces", "kerf"].includes(fact.field),
    );
  });
}

export function uncertainDimensionAssociation(dimension: AnalysisSuggestion) {
  const evidence = [
    dimension.notes,
    dimension.calculationBasis,
    ...(dimension.warnings ?? []),
  ].join("; ");
  return (
    (/association|associated|assembly|member/i.test(evidence) &&
      /uncertain|ambiguous|unresolved|not established|without endpoint association/i.test(
        evidence,
      )) ||
    (dimension.beamAssemblies ?? []).some((beam) =>
      beam.dimensions.some((d) => d.association === "Uncertain"),
    )
  );
}
