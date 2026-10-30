import { spatialBeamRecipe } from "./spatialBeamPrefill";
import { normalizeSpecification } from "../shared/componentIdentity";
import type { TakeoffItem } from "./model";
import { isBeamMaterial } from "./beamMaterial";
import {
  mergeMaterialInputs,
  materialInputProblem,
} from "../shared/materialInputs";
import {
  sameSpatialBeam,
  uniqueSpatialBeams,
  mergeSpatialBeams,
} from "../shared/spatialBeams";
const eligible = (t: TakeoffItem) =>
  t.origin === "ai" &&
  t.status === "Proposed" &&
  !t.reviewAcknowledged &&
  !t.overlapReviews?.length &&
  !t.convertedLineId &&
  !t.scopeVerified &&
  !t.purchaseVerified &&
  !t.conflictsVerified &&
  (!t.calculation ||
    (!t.calculation.verified &&
      JSON.stringify(t.calculation) ===
        JSON.stringify(spatialBeamRecipe(t)))) &&
  !/^Manual /i.test(t.calculationBasis ?? "") &&
  isBeamMaterial(t) &&
  !!t.beamAssemblies?.length;
/** Consolidate only the same evidenced physical set, never count matching labels. */
export function consolidateBeamReviews(items: TakeoffItem[]) {
  const result: TakeoffItem[] = [];
  for (const original of items) {
    const item = structuredClone(original);
    const prior =
      eligible(item) &&
      result.find(
        (t) =>
          eligible(t) &&
          !!t.documentId &&
          t.documentId === item.documentId &&
          (t.destination ?? "Materials") ===
            (item.destination ?? "Materials") &&
          normalizeSpecification(t.specification ?? "") ===
            normalizeSpecification(item.specification ?? "") &&
          t.location === item.location &&
          t.workScope === item.workScope &&
          t.included === item.included &&
          t.alternativeGroup === item.alternativeGroup &&
          t.alternativeOption === item.alternativeOption &&
          !materialInputProblem(
            mergeMaterialInputs(t.materialInputs, item.materialInputs),
          ) &&
          t.stockLength === item.stockLength &&
          uniqueSpatialBeams(item.beamAssemblies!).some((g) =>
            t.beamAssemblies!.some((b) => sameSpatialBeam(b, g[0])),
          ) &&
          (uniqueSpatialBeams(item.beamAssemblies!).every((g) =>
            t.beamAssemblies!.some((b) => sameSpatialBeam(b, g[0])),
          ) ||
            uniqueSpatialBeams(t.beamAssemblies!).every((g) =>
              item.beamAssemblies!.some((b) => sameSpatialBeam(b, g[0])),
            ) ||
            !!t.location?.trim()),
      );
    if (!prior) {
      result.push(item);
      continue;
    }
    const merged = mergeSpatialBeams(prior.beamAssemblies, item.beamAssemblies);
    const inputs = mergeMaterialInputs(
      prior.materialInputs,
      item.materialInputs,
    );
    const facts = [
      ...new Set([
        ...(prior.sourceFacts ?? []),
        ...(item.sourceFacts ?? []),
        ...[prior, item].map(
          (t) =>
            `Source observation ${t.id}: ${t.description}; ${t.specification ?? ""}; ${t.documentId}, page ${t.page ?? "unknown"}, detail ${t.sourceDetailView ?? "original"}; ${t.quantity ?? "unknown"} ${t.unit}; ${t.calculationBasis ?? ""}; ${t.notes}`,
        ),
      ]),
    ];
    const conflict =
      prior.quantity !== null &&
      item.quantity !== null &&
      (prior.quantity !== item.quantity || prior.unit !== item.unit);
    const warnings = [
      ...new Set([
        ...(prior.warnings ?? []),
        ...(item.warnings ?? []),
        ...(conflict
          ? [
              "Conflicting quantities in repeated beam observations: confirm the physical assembly count; quantities were not added.",
            ]
          : []),
      ]),
    ];
    const assumptions = [
      ...new Set([...(prior.assumptions ?? []), ...(item.assumptions ?? [])]),
    ];
    if (
      merged.length > 20 ||
      inputs.length > 40 ||
      facts.length > 20 ||
      facts.some((f) => f.length > 1000) ||
      warnings.length > 20 ||
      assumptions.length > 20
    ) {
      result.push(item);
      continue;
    }
    // Retain the original source record for saved-analysis provenance. Only the
    // consolidated primary remains a review/purchase candidate.
    result.push({
      ...item,
      status: "Rejected",
      included: false,
      notes: `${item.notes}\nConsolidated source observation into ${prior.id}; not an additional billable material.`,
    });
    // Only a recipe exactly reproducible from source evidence is refreshed.
    // Manual inputs, blanks, stock choices and verified recipes are ineligible.
    if (prior.calculation) delete prior.calculation;
    prior.beamAssemblies = merged;
    if (inputs.length) prior.materialInputs = inputs;
    prior.sourceFacts = facts;
    prior.warnings = warnings;
    prior.assumptions = assumptions;
    if (conflict) prior.quantity = null;
    const ranking = ["Unspecified", "Low", "Medium", "High"] as const;
    prior.confidence =
      ranking[
        Math.min(
          ranking.indexOf(prior.confidence),
          ranking.indexOf(item.confidence),
        )
      ];
  }
  return result;
}
