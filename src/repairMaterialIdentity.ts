import {
  referenceCountOnly,
  referenceCountInput,
} from "../shared/quantityEvidence";
import type { Quote, TakeoffItem } from "./model";
import { separateMixedHardware } from "../shared/materialIdentity";
import { materialCategoryFor } from "../shared/takeoff";
import { normalizeSpecification } from "../shared/componentIdentity";
import { sameSpatialBeam } from "../shared/spatialBeams";
const snapshot = (item: TakeoffItem): Omit<TakeoffItem, "identitySource"> => {
  const { identitySource: original, ...source } = structuredClone(item);
  return original ?? source;
};
/** Correct the actual data before calculators/deduplication, not its display name.
 * Identity changes invalidate prior review. Already converted estimate lines are
 * untouched and remain subject to the consistency gate for any new conversion. */
export function repairMaterialIdentity(q: Quote): Quote {
  if (q.status !== "Draft") return q;
  const additions: TakeoffItem[] = [];
  const takeoff = q.takeoff.map((item) => {
    if (
      item.origin !== "ai" ||
      item.convertedLineId ||
      item.status === "Rejected"
    )
      return item;
    const parts = separateMixedHardware(item);
    if (!parts) {
      if (
        !item.reviewAcknowledged &&
        !item.calculation?.verified &&
        (referenceCountOnly(item) ||
          item.materialInputs?.some(referenceCountInput))
      ) {
        return {
          ...item,
          identitySource: snapshot(item),
          quantity: null,
          quantityMethod: "Unknown" as const,
          calculation: undefined,
          materialInputs: (item.materialInputs ?? []).filter(
            (f) =>
              !referenceCountInput(f) &&
              !(referenceCountOnly(item) && f.field === "count"),
          ),
        };
      }
      return item;
    }
    if (parts.related) {
      const related = parts.related;
      const key = (t: TakeoffItem) =>
        t.documentId === related.documentId &&
        t.page === related.page &&
        t.location === related.location &&
        materialCategoryFor(t) === related.category &&
        normalizeSpecification(t.specification ?? "") ===
          normalizeSpecification(related.specification ?? "") &&
        (related.beamAssemblies ?? []).every((b) =>
          t.beamAssemblies?.some((old) => sameSpatialBeam(old, b)),
        );
      if (!q.takeoff.some(key) && !additions.some(key))
        additions.push({
          ...related,
          id: `${item.id}:identity:${related.category === "Beams" ? "beam" : "hardware"}`,
          analysisId: item.analysisId,
          origin: "ai",
          calculation: undefined,
          status: "Proposed",
          included: false,
          workScope: "Requires scope confirmation",
          reviewAcknowledged: false,
          scopeVerified: false,
        });
    }
    return {
      ...item,
      ...parts.primary,
      identitySource: snapshot(item),
      calculation: undefined,
      stockLength: undefined,
      scopeOverride: undefined,
      originalScope: item.originalScope,
      workScope: "Requires scope confirmation" as const,
      included: false,
      status: "Proposed" as const,
      reviewAcknowledged: false,
      scopeVerified: false,
      purchaseVerified: false,
      conflictsVerified: false,
      overlapReviews: [],
    };
  });
  return { ...q, takeoff: [...takeoff, ...additions] };
}
