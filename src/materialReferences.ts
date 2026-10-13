import { workScope, includedScope } from "./takeoffScope";
import type { Quote, TakeoffItem } from "./model";
/** Unquantified AI requirements are evidence, never purchasing records. */
export function isGeneralSpecification(t: TakeoffItem) {
  return (
    t.origin === "ai" &&
    !t.convertedLineId &&
    t.quantity === null &&
    /^(?:general (?:material |construction )?(?:specifications?|requirements?|notes?)|all (?:fasteners?|connectors?|hardware)\b|(?:galvanized|galvanised|hot[- ]dip galvanized|corrosion[- ]resistant) (?:fastener|hardware|connector)s? (?:requirements?|specifications?))/i.test(
      t.description,
    )
  );
}
export function relevantSpecifications(q: Quote, items: TakeoffItem[]) {
  return q.takeoff.filter(
    (ref) =>
      isGeneralSpecification(ref) &&
      ref.status !== "Rejected" &&
      ref.included !== false &&
      workScope(ref) !== "Existing work to remain" &&
      (!["By others", "By others / excluded"].includes(workScope(ref)) ||
        includedScope(ref)) &&
      items.some(
        (t) =>
          t.id !== ref.id &&
          !!t.documentId &&
          t.documentId === ref.documentId &&
          (!ref.location?.trim() ||
            /^(?:general|all|whole project)$/i.test(ref.location.trim()) ||
            ref.location.trim().toLowerCase() ===
              t.location?.trim().toLowerCase()) &&
          /fastener|screw|bolt|hanger|connector|hardware/i.test(
            [t.description, t.specification].join(" "),
          ) &&
          /fastener|screw|bolt|hanger|connector|hardware/i.test(
            [
              ref.description,
              ref.specification,
              ...(ref.sourceFacts ?? []),
            ].join(" "),
          ),
      ),
  );
}
