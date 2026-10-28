import { isBeamMaterial } from "./beamMaterial";
import { spatialBeamReviewProblem } from "./spatialBeamPrefill";
import type { TakeoffItem } from "./model";
import { materialInputProblem } from "../shared/materialInputs";
export function hasReadableSpecification(t: TakeoffItem) {
  return (
    !!t.specification?.trim() &&
    !/^(?:unknown|not specified|unspecified|requires contractor input|contractor input required|tbd|tbc)\b|\b(?:unreadable|illegible|not legible|not readable)\b/i.test(
      t.specification,
    )
  );
}
export function completenessProblem(t: TakeoffItem) {
  if (
    isBeamMaterial(t) &&
    !t.scopeVerified &&
    t.beamAssemblies?.some((b) => b.scope === "Requires scope confirmation")
  )
    return "Confirm which proposed beam lines are included in this work before approval.";
  if (!t.conflictsVerified && spatialBeamReviewProblem(t))
    return spatialBeamReviewProblem(t);
  if (!t.conflictsVerified && materialInputProblem(t.materialInputs))
    return materialInputProblem(t.materialInputs);
  if (
    t.itemRole === "Document observation" ||
    t.itemRole === "Supporting evidence"
  )
    return "Drawing observations are evidence, not purchasable estimate items.";
  if (
    t.origin === "ai" &&
    t.destination === "Materials" &&
    !hasReadableSpecification(t)
  )
    return "Enter a readable, verified material specification before approval.";
  if (t.warnings?.some((w) => /conflicting/i.test(w)) && !t.conflictsVerified)
    return "Reconcile conflicting observations against the source before approval.";
  return "";
}
