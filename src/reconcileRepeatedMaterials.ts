import type { TakeoffItem } from "./model";
import { consolidateTakeoff } from "./consolidateTakeoff";
/** Preserve each source record; only explicit, unreviewed same-assembly observations may become one candidate. */
export function reconcileRepeatedMaterials(items: TakeoffItem[]) {
  const next = structuredClone(items);
  for (let i = 0; i < next.length; i++) {
    const a = next[i];
    if (!eligible(a)) continue;
    for (let j = i + 1; j < next.length; j++) {
      const b = next[j];
      if (!eligible(b)) continue;
      const merged = consolidateTakeoff([a, b], true);
      if (merged.length !== 1) continue;
      Object.assign(a, merged[0]);
      // Archive instead of deleting IDs/source facts; re-analysis can still trace originals.
      b.status = "Rejected";
      b.included = false;
      b.reviewAcknowledged = false;
      b.notes = [
        b.notes,
        `Repeated source observation consolidated into material ${a.id}; quantity was not added.`,
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
  return next;
}
function eligible(t: TakeoffItem) {
  return (
    t.origin === "ai" &&
    t.status === "Proposed" &&
    !t.convertedLineId &&
    !t.reviewAcknowledged &&
    !t.scopeVerified &&
    !t.purchaseVerified &&
    !t.calculation &&
    !t.overlapReviews?.length &&
    !/^Manual /i.test(t.calculationBasis ?? "") &&
    /flashing|joist hanger|lus26/i.test(
      t.description + " " + t.specification,
    ) &&
    (t.sourceFacts ?? []).some((f) =>
      /repeated view of (?:the )?same (?:physical )?(?:assembly|component)|same physical assembly/i.test(
        f,
      ),
    )
  );
}
