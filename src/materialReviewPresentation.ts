import type { Quote, TakeoffItem } from "./model";
import { materialCategoryFor } from "../shared/takeoff";
import { reviewBucket } from "./takeoffReview";
import { purchaseQuantityProblem } from "../shared/componentIdentity";
import { unresolvedFoundationAlternative } from "./takeoffScope";
import { calculateMaterial } from "../shared/materialCalculators";
export function materialReviewGroup(q: Quote, t: TakeoffItem) {
  if (
    t.destination === "Informational" ||
    (t.itemRole && t.itemRole !== "Construction item")
  )
    return "Informational / excluded";
  if ((t.destination ?? "Materials") !== "Materials")
    return t.destination === "Labour" ? "Labour" : "Other work";
  const text = [t.description, t.specification].join(" ");
  if (/flashing|waterproof/i.test(text)) return "Flashing & Waterproofing";
  if (/footing|foundation|concrete.*pier/i.test(text))
    return "Footings & Foundations";
  if (/deck (?:boards?|planks?)|decking/i.test(text)) return "Decking";
  const category = materialCategoryFor(t) ?? t.category;
  if (
    [
      "Posts",
      "Beams",
      "Joists",
      "Ledger",
      "Blocking",
      "Hangers / connectors",
      "Structural fasteners",
    ].includes(category ?? "")
  )
    return /deck/i.test([q.name, q.description, text].join(" "))
      ? "Deck Framing"
      : "Structural Framing";
  return t.category && t.category !== "Miscellaneous"
    ? t.category
    : "Other materials";
}
export function materialNextAction(q: Quote, t: TakeoffItem) {
  if (t.convertedLineId || t.status === "Approved") return "";
  const bucket = reviewBucket(q, t);
  if (bucket === "Excluded or informational") return "";
  if (unresolvedFoundationAlternative(q, t)) return "Select foundation method";
  if (bucket === "Potential duplicates or conflicts")
    return t.warnings?.some((w) => /conflicting/i.test(w)) &&
      !t.conflictsVerified
      ? "Reconcile conflicting quantities"
      : "Review possible duplicate";
  if (bucket === "Needs scope confirmation")
    return "Confirm this work is included";
  if (!t.description.trim()) return "Enter material description";
  if (!t.unit.trim()) return "Select quantity unit";
  if (t.quantity === null) {
    const noun = /joist/i.test(t.description)
      ? "joist"
      : /beam/i.test(t.description)
        ? "beam"
        : /post/i.test(t.description)
          ? "post"
          : /footing/i.test(t.description)
            ? "footing"
            : /board|decking/i.test(t.description)
              ? "board"
              : "material";
    return t.destination === "Labour"
      ? "Enter verified labour hours"
      : `Enter verified ${noun} quantity`;
  }
  if (
    t.calculation &&
    calculateMaterial(t.calculation).missing.some((m) =>
      /stock length/i.test(m),
    )
  )
    return "Confirm board length";
  if (purchaseQuantityProblem(t)) return "Confirm stock and purchase quantity";
  if (bucket === "Needs quantity or specification")
    return "Confirm material specification";
  return t.origin === "ai" && !t.reviewAcknowledged
    ? "Verify against drawing before approval"
    : "";
}
