import { consolidateBeamReviews } from "./consolidateBeamReviews";
import type { Quote, TakeoffItem } from "./model";
import { initializeBeamCalculator } from "./initializeBeamCalculator";
import { isBeamMaterial } from "./beamMaterial";
import { consolidateCompared } from "./takeoffOverlap";
import { sameBeamCalculator } from "./beamRecipeIdentity";
import {
  repeatEvidenceEligible,
  repeatedMaterialKey,
} from "../shared/componentIdentity";
import { materialCategoryFor } from "../shared/takeoff";
const labels = (t: TakeoffItem) =>
  [
    ...new Set(
      (t.sourceFacts ?? []).flatMap((f) =>
        [...f.matchAll(/\bbeam\s*(?:run\s*)?([A-Za-z]?\d+)\b/gi)].map((m) =>
          m[1].toUpperCase(),
        ),
      ),
    ),
  ].sort();
export function repairBeamReview(q: Quote): Quote {
  if (q.status !== "Draft") return q;
  let next = {
    ...q,
    takeoff: consolidateBeamReviews(q.takeoff).map((t) => {
      if (
        t.origin !== "ai" ||
        t.status !== "Proposed" ||
        t.convertedLineId ||
        t.reviewAcknowledged ||
        !isBeamMaterial(t)
      )
        return t;
      if (t.calculation?.verified) return t;
      if (t.calculation && t.calculation.kind !== "beam-runs") return t;
      const calculation = initializeBeamCalculator(t);
      if (
        !calculation ||
        (!t.calculation && Object.keys(calculation.inputs).length === 0) ||
        JSON.stringify(calculation) === JSON.stringify(t.calculation)
      )
        return t;
      return {
        ...t,
        calculation,
        quantity: null,
        unit: "boards",
        quantityMethod: "Unknown" as const,
        classification: "Contractor input required" as const,
        notes: t.calculation
          ? t.notes
          : [
              t.notes,
              t.quantity !== null
                ? `Original proposed observation: ${t.quantity} ${t.unit}; not a verified purchase quantity.`
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
      };
    }),
  };
  const candidates = next.takeoff.filter(
    (t) =>
      t.origin === "ai" &&
      t.status === "Proposed" &&
      !t.convertedLineId &&
      !t.reviewAcknowledged &&
      !t.calculation?.verified &&
      isBeamMaterial(t),
  );
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++) {
      const a = next.takeoff.find((t) => t.id === candidates[i].id)!,
        b = next.takeoff.find((t) => t.id === candidates[j].id)!;
      if (
        a.status !== "Proposed" ||
        b.status !== "Proposed" ||
        !repeatEvidenceEligible(a) ||
        !repeatEvidenceEligible(b) ||
        !sameBeamCalculator(a, b)
      )
        continue;
      const key = repeatedMaterialKey(a, materialCategoryFor(a));
      if (!key || key !== repeatedMaterialKey(b, materialCategoryFor(b)))
        continue;
      const aLabels = labels(a),
        bLabels = labels(b),
        named =
          aLabels.length > 0 &&
          JSON.stringify(aLabels) === JSON.stringify(bLabels);
      const explicitRepeat = [
        ...(a.sourceFacts ?? []),
        ...(b.sourceFacts ?? []),
      ].some((f) =>
        /same (?:physical )?beam (?:assembly|runs|set)|repeated (?:view|observation) of (?:the )?(?:same )?beam/i.test(
          f,
        ),
      );
      if (!named && !explicitRepeat) continue;
      try {
        next = consolidateCompared(next, a, b);
      } catch {
        /* Conflicts or evidence limits preserve both records for contractor comparison. */
      }
    }
  return next;
}
