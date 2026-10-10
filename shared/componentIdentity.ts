import type { AnalysisSuggestion } from "./analysis";
// Conservative notation aliases only. Never fuzzy-match dimensions, products or locations.
export const normalizeSpecification = (value: string) =>
  value
    .toLowerCase()
    .replace(/pressure[- ]treated/g, "pt")
    .replace(/[×✕]/g, "x")
    .replace(/(\d)\s*x\s*(\d)/g, "$1x$2")
    .replace(/(\d)[ -]+ply/g, "$1ply")
    .replace(/[^a-z0-9./]+/g, " ")
    .trim();
export type ScopeClassification =
  | "New work"
  | "Existing work to remain"
  | "Existing work to remove or modify"
  | "By others / excluded"
  | "Requires scope confirmation";
export function evidenceScope(
  item: Pick<
    AnalysisSuggestion,
    | "description"
    | "sourceFacts"
    | "notes"
    | "supportBasis"
    | "subcontractorBasis"
  >,
): ScopeClassification {
  const text = [item.description, ...(item.sourceFacts ?? []), item.notes].join(
    "; ",
  );
  if (/\b(?:excluded|not in contract)\b/i.test(text))
    return "By others / excluded";
  if (
    item.supportBasis === "By others" ||
    item.subcontractorBasis === "Explicit by others" ||
    (/\bby[- ]others\b/i.test(text) &&
      !/\b(?:no|not|without)\b[^.;\n]{0,45}\bby[- ]others\b/i.test(text) &&
      !/(?:verify|confirm|uncertain|whether)[^.;\n]{0,100}by[- ]others|existing\/new\/by[- ]others/i.test(
        text,
      ))
  )
    return "By others / excluded";
  if (/\bexisting\b[^.;\n]{0,65}\b(?:remain|retain|retained)\b/i.test(text))
    return "Existing work to remain";
  if (
    /\bexisting\b[^.;\n]{0,65}\b(?:remove|modify|demolish|replace)\b/i.test(
      text,
    )
  )
    return "Existing work to remove or modify";
  if (
    item.supportBasis === "Existing work" ||
    /\bexisting\b/i.test(item.description)
  )
    return "Requires scope confirmation";
  if (
    item.supportBasis === "Apparent new work" ||
    /\bnew (?:work|construction|deck|posts?|footings?|beams?|joists?)\b/i.test(
      text,
    )
  )
    return "New work";
  return "Requires scope confirmation";
}
export function equivalentComponentKey(
  item: AnalysisSuggestion,
  category?: string,
) {
  if (!category || !item.specification?.trim() || !item.location?.trim())
    return "";
  return JSON.stringify([
    item.documentId,
    item.destination,
    category,
    normalizeSpecification(item.specification),
    [
      ...new Set(
        (
          [item.description, item.specification]
            .join(" ")
            .match(
              /\b(?:screws?|bolts?|flashing|panels?|post bases?|post caps?)\b/gi,
            ) ?? []
        ).map((part) => part.toLowerCase().replace(/s$/, "")),
      ),
    ].sort(),
    normalizeSpecification(item.location),
    [
      ...new Set(
        (
          [item.description, item.specification, item.location]
            .join(" ")
            .match(
              /\b(?:[BPFJG]\d+|north|south|east|west|front|rear|upper|lower|left|right|landing)\b/gi,
            ) ?? []
        ).map((label) => label.toLowerCase()),
      ),
    ].sort(),
    item.scopeGroup?.trim().toLowerCase() ?? "",
    evidenceScope(item),
    item.supportBasis ?? "Not established",
    item.subcontractorBasis ?? "Not established",
    item.unit.trim().toLowerCase(),
    item.quantity,
  ]);
}
export function purchaseQuantityProblem(item: {
  description: string;
  destination?: string;
  unit: string;
  calculation?: unknown;
  origin?: string;
  category?: string;
  purchaseVerified?: boolean;
}) {
  if (item.destination !== "Materials" || item.calculation) return "";
  if (/\b(?:beam )?runs?\b|\blocations?\b|\bsymbols?\b/i.test(item.unit))
    return "Drawing runs/locations are observations, not purchase quantities. Use a verified stock/layout calculator or enter a contractor-verified purchase quantity and unit.";
  if (
    item.origin === "ai" &&
    (item.category === "Beams" || /\bbeams?\b/i.test(item.description)) &&
    !item.purchaseVerified
  )
    return "Verify beam purchase quantities from lengths, plies, stock lengths and approved cut/splice layout. Beam-run counts alone cannot be purchased as boards.";
  return "";
}
