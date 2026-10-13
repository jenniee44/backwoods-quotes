import type { TakeoffItem } from "./model";
import {
  repeatedMaterialKey as equivalentComponentKey,
  repeatEvidenceEligible,
} from "../shared/componentIdentity";
import { materialCategoryFor } from "../shared/takeoff";
import { semanticItemKey } from "../shared/takeoff";
export function consolidateTakeoff(items: TakeoffItem[], automatic = false) {
  const retained: TakeoffItem[] = [];
  const seen = new Map<string, TakeoffItem>();
  for (const item of items) {
    // Reviewed/converted entries remain immutable. Cross-page matches need known
    // equivalent specifications/location/scope; distinct recipes/quantities stay separate.
    const key = JSON.stringify([
      equivalentComponentKey(item, materialCategoryFor(item)) ||
        semanticItemKey(item),
      automatic ? (materialCategoryFor(item) ?? item.category) : item.category,
      item.workScope,
      item.included,
      item.alternativeGroup,
      item.alternativeOption,
      item.calculation,
      item.stockLength ?? null,
      ...(automatic
        ? [
            [
              ...new Set(
                [item.description, item.specification]
                  .join(" ")
                  .toLowerCase()
                  .match(
                    /helical|screw pile|concrete|cast.in.place|precast|strip footing|pad footing|steel|wood/g,
                  ) ?? [],
              ),
            ].sort(),
          ]
        : []),
    ]);
    const existing = seen.get(key);
    if (
      (automatic &&
        (item.origin !== "ai" ||
          !item.documentId ||
          !repeatEvidenceEligible(item) ||
          /possibly|may be|unconfirmed|uncertain|could be|alternative/i.test(
            [item.description, item.notes, ...(item.warnings ?? [])].join(" "),
          ) ||
          !equivalentComponentKey(item, materialCategoryFor(item)))) ||
      !item.description.trim() ||
      item.status !== "Proposed" ||
      item.convertedLineId ||
      !existing
    ) {
      const copy = structuredClone(item);
      retained.push(copy);
      if (
        item.status === "Proposed" &&
        !item.convertedLineId &&
        (!automatic ||
          (item.origin === "ai" &&
            !!item.documentId &&
            !!repeatEvidenceEligible(item) &&
            !/possibly|may be|unconfirmed|uncertain|could be|alternative/i.test(
              [item.description, item.notes, ...(item.warnings ?? [])].join(
                " ",
              ),
            ) &&
            !!equivalentComponentKey(item, materialCategoryFor(item))))
      )
        seen.set(key, copy);
      continue;
    }
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
    const facts = unique([
      ...(existing.sourceFacts ?? []),
      ...(item.sourceFacts ?? []),
      "Original observation: " + existing.description,
      "Original observation: " + item.description,
      `Source: ${existing.documentId || "manual"}, page ${existing.page ?? "unknown"}, detail ${existing.sourceDetailView ?? "original"}; ${existing.specification ?? ""}`,
      `Source: ${item.documentId || "manual"}, page ${item.page ?? "unknown"}, detail ${item.sourceDetailView ?? "original"}; ${item.specification ?? ""}`,
      item.notes,
      ...(item.calculationBasis &&
      item.calculationBasis !== existing.calculationBasis
        ? [`Source calculation: ${item.calculationBasis}`]
        : []),
    ]);
    if (
      facts.length > 20 ||
      facts.some((fact) => fact.length > 1000) ||
      unique([...(existing.warnings ?? []), ...(item.warnings ?? [])]).length >
        20 ||
      unique([...(existing.assumptions ?? []), ...(item.assumptions ?? [])])
        .length > 20
    ) {
      retained.push(structuredClone(item));
      continue;
    }
    // Additional evidence must be reviewed again; never inherit a verification
    // from only one of the observations being consolidated.
    existing.scopeVerified = false;
    existing.purchaseVerified = false;
    existing.conflictsVerified = false;
    existing.reviewAcknowledged = false;
    existing.sourceFacts = facts;
    existing.warnings = unique([
      ...(existing.warnings ?? []),
      ...(item.warnings ?? []),
    ]);
    existing.assumptions = unique([
      ...(existing.assumptions ?? []),
      ...(item.assumptions ?? []),
    ]);
    existing.notes = unique([existing.notes, item.notes]).join("; ");
    const confidence = ["Unspecified", "Low", "Medium", "High"];
    existing.confidence = confidence[
      Math.min(
        confidence.indexOf(existing.confidence),
        confidence.indexOf(item.confidence),
      )
    ] as TakeoffItem["confidence"];
  }
  return retained;
}
