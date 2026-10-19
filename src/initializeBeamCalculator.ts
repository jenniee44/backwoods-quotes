import type { TakeoffItem } from "./model";
import { isBeamMaterial } from "./beamMaterial";
import { enrichBeamRecipe, proposedBeamRecipe } from "./beamPrefill";
import { includedScope } from "./takeoffScope";
/** Choosing the beam tool is independent of establishing distinct physical runs. */
export function initializeBeamCalculator(t: TakeoffItem) {
  if (
    !isBeamMaterial(t) ||
    t.origin !== "ai" ||
    (t.destination ?? "Materials") !== "Materials" ||
    t.status !== "Proposed" ||
    t.reviewAcknowledged ||
    t.convertedLineId ||
    !includedScope(t) ||
    (t.itemRole && t.itemRole !== "Construction item") ||
    (!t.calculation && t.quantity !== null && t.quantityMethod === "Unknown") ||
    /^Manual /i.test(t.calculationBasis ?? "")
  )
    return t.calculation;
  if (t.calculation)
    return t.calculation.kind === "beam-runs"
      ? enrichBeamRecipe(t, t.calculation)
      : t.calculation;
  return (
    proposedBeamRecipe(t) ?? {
      kind: "beam-runs",
      inputs: {},
      verified: false,
      runCountSource:
        "Distinct physical beam runs are not established. Source observations and repeated specifications are not beam counts.",
    }
  );
}
