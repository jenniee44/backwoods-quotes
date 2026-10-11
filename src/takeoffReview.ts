import { hasReadableSpecification } from "./takeoffRequirements";
import type { Quote, TakeoffItem } from "./model";
import { calculateMaterial } from "../shared/materialCalculators";
import { purchaseQuantityProblem } from "../shared/componentIdentity";
import { requiresScopeVerification } from "../shared/takeoff";
import {
  includedScope,
  workScope,
  unresolvedFoundationAlternative,
} from "./takeoffScope";
import { unresolvedOverlaps } from "./takeoffOverlap";
import { canConvert } from "./planAnalysis";

export const reviewBuckets = [
  "Ready for review",
  "Needs quantity or specification",
  "Needs scope confirmation",
  "Potential duplicates or conflicts",
  "Excluded or informational",
] as const;
export type ReviewBucket = (typeof reviewBuckets)[number];
export function reviewBucket(q: Quote, t: TakeoffItem): ReviewBucket {
  if (
    t.status === "Rejected" ||
    t.destination === "Informational" ||
    (t.itemRole && t.itemRole !== "Construction item") ||
    workScope(t) === "Existing work to remain" ||
    (["By others", "By others / excluded"].includes(workScope(t)) &&
      !includedScope(t)) ||
    (t.included === false && workScope(t) !== "Requires scope confirmation")
  )
    return "Excluded or informational";
  if (
    unresolvedOverlaps(q, t).length ||
    unresolvedFoundationAlternative(q, t) ||
    (t.warnings?.some((w) => /conflicting/i.test(w)) && !t.conflictsVerified)
  )
    return "Potential duplicates or conflicts";
  if (!includedScope(t) || (requiresScopeVerification(t) && !t.scopeVerified))
    return "Needs scope confirmation";
  if (
    t.quantity === null ||
    !t.description.trim() ||
    !t.unit.trim() ||
    ((t.destination ?? "Materials") === "Materials" &&
      !hasReadableSpecification(t)) ||
    purchaseQuantityProblem(t) ||
    (t.calculation && calculateMaterial(t.calculation).quantity !== t.quantity)
  )
    return "Needs quantity or specification";
  return "Ready for review";
}
export function readyForEstimate(q: Quote, t: TakeoffItem) {
  return reviewBucket(q, t) === "Ready for review" && canConvert(t);
}
