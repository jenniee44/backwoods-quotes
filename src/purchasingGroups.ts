import { assertScope, unresolvedFoundationAlternative } from "./takeoffScope";
import { calculateMaterial } from "../shared/materialCalculators";
import type { Quote, TakeoffItem } from "./model";
import { normalizeSpecification } from "../shared/componentIdentity";
import {
  friendlyMaterialName,
  preliminaryDisposition,
} from "./preliminaryMaterials";
import { readyForEstimate } from "./takeoffReview";
import { unresolvedOverlaps } from "./takeoffOverlap";
export function quantityReason(q: Quote, t: TakeoffItem) {
  if (unresolvedFoundationAlternative(q, t))
    return "Confirm the foundation method: concrete footings or helical piles.";
  if (t.calculation) {
    const missing = calculateMaterial(t.calculation).missing;
    if (missing.length)
      return "Missing calculator inputs: " + missing.join(", ") + ".";
    if (!t.calculation.verified)
      return "Verify the calculator dimensions and assembly inputs in Review details.";
  }
  if (
    unresolvedOverlaps(q, t).length ||
    /conflict/i.test((t.warnings ?? []).join(" "))
  )
    return "Confirm which observations describe the same assembly and resolve conflicting counts.";
  if (preliminaryDisposition(t, q) === "information")
    return "Reference or excluded work; not a purchase material.";
  if (!t.specification?.trim() || /unreadable|unknown/i.test(t.specification))
    return "Confirm the readable material specification.";
  if (/beam/i.test(t.description))
    return "Confirm beam lengths, ply counts, suitable stock lengths and cut/splice layout; beam runs are not boards.";
  if (/hanger|fastener|screw|bolt|connector/i.test(t.description))
    return "Confirm connection counts and the specified hardware pieces per connection.";
  if (/joist/i.test(t.description))
    return "Confirm deck layout dimensions, spacing, openings, joist lengths and suitable stock lengths.";
  if (/decking|deck boards/i.test(t.description))
    return "Confirm deck dimensions, board width, layout direction, gaps and stock lengths.";
  if (/footing|pier|pile/i.test(t.description))
    return "Confirm new support counts, foundation method and footing/pier specifications.";
  return "Confirm quantity, purchase unit and included scope in Review details.";
}
/** Presentation only. Never merge records, sum counts or change approvals. */
export function purchasingGroups(q: Quote, items: TakeoffItem[]) {
  const groups = new Map<string, { name: string; items: TakeoffItem[] }>();
  for (const t of items) {
    if (preliminaryDisposition(t, q) === "information") continue;
    const name = friendlyMaterialName(t).split(" — ")[0];
    const spec = normalizeSpecification(
      (t.specification ?? "")
        .replace(/@/g, " at ")
        .replace(/(\d+)\s*(?:["″]|\binches\b)/g, "$1 in")
        .replace(/\bo\s*[./]?\s*c\b\.?/gi, "on centre")
        .replace(/\bon center\b/gi, "on centre"),
    );
    const key = JSON.stringify([name.toLowerCase(), spec]);
    const group = groups.get(key);
    if (group) group.items.push(t);
    else groups.set(key, { name, items: [t] });
  }
  return [...groups.values()].map((g) => {
    const t = g.items[0];
    let scopeOkay = true;
    try {
      assertScope(q, t);
    } catch {
      scopeOkay = false;
    }
    const safe =
      scopeOkay &&
      g.items.length === 1 &&
      t.quantity !== null &&
      preliminaryDisposition(t, q) === "material" &&
      (readyForEstimate(q, t) ||
        (t.quantityMethod === "Calculated" &&
          !!t.calculationBasis?.trim() &&
          !!t.sourceFacts?.length &&
          ["Medium", "High"].includes(t.confidence) &&
          !t.assumptions?.length &&
          (!t.calculation || t.calculation.verified) &&
          /^(boards|each|sq ft|sq\. ft|square feet)$/i.test(t.unit) &&
          !/conflict|unreadable|uncertain|alternative/i.test(
            [t.notes, ...(t.warnings ?? [])].join(" "),
          )));
    return {
      ...g,
      quantity: safe ? t.quantity : null,
      unit: t.unit,
      reason: safe
        ? "Verify calculated inputs before approval."
        : g.items.length > 1
          ? "Multiple source observations: confirm separate assemblies or repeated views. Counts are not added. " +
            quantityReason({ ...q, takeoff: [] }, t)
          : quantityReason(q, t),
    };
  });
}
