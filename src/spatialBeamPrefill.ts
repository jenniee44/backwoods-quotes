import type { TakeoffItem } from "./model";
import {
  validCalculation,
  type MaterialCalculation,
} from "../shared/materialCalculators";
import {
  beamGeometryProblem,
  spatialBeamOverlap,
  sameSpatialBeam,
  pointToBeam,
  fullBeamDimension,
  uniqueSpatialBeams,
  type SpatialBeam,
} from "../shared/spatialBeams";
import { drawingMeasurements } from "../shared/constructionMeasurements";
function spatialLengths(item: TakeoffItem, observations: SpatialBeam[]) {
  const lengths = observations.flatMap((b) =>
    b.dimensions
      .filter((d) => {
        if (!fullBeamDimension(b, d)) return false;
        const distance = (beam: SpatialBeam) =>
          pointToBeam(d.start, beam) + pointToBeam(d.end, beam);
        // Proximity alone is never a measurement association. Even an explicit
        // proposed association is withheld when an equally plausible or nearer
        // parallel full-extent line contradicts it.
        return !(item.beamAssemblies ?? []).some(
          (other) =>
            other.page === b.page &&
            !sameSpatialBeam(b, other) &&
            fullBeamDimension(other, d) &&
            distance(other) <= distance(b) + 0.005,
        );
      })
      .flatMap((d) => {
        const measures = drawingMeasurements({
          ...item,
          page: b.page,
          sourceFacts: [d.written],
        });
        if (
          measures.length !== 1 ||
          measures[0].written.trim() !== d.written.trim() ||
          /approx|assum|uncertain|unreadable|scale|pixel|not confirmed/i.test(
            d.evidence,
          )
        )
          return [];
        return [
          {
            feet: measures[0].inches / 12,
            written: d.written,
            reference: `${item.sourceDocumentName || item.documentId} · page ${b.page} · ${b.sheet || "Sheet unidentified"}: ${d.evidence}`,
          },
        ];
      }),
  );
  return lengths;
}
export function spatialBeamLength(
  item: TakeoffItem,
  observations: SpatialBeam[],
) {
  const lengths = spatialLengths(item, observations);
  if (new Set(lengths.map((l) => l.feet)).size !== 1) return null;
  return {
    ...lengths[0],
    references: [...new Set(lengths.map((l) => l.reference))],
  };
}
export function spatialBeamRecipe(
  item: TakeoffItem,
): MaterialCalculation | null {
  const observations = item.beamAssemblies ?? [];
  const included = observations.filter((b) => b.scope === "New work");
  if (
    !included.length ||
    spatialBeamOverlap(included) ||
    included.some((b) => !!beamGeometryProblem(b))
  )
    return null;
  const groups = uniqueSpatialBeams(included);
  const recipe: MaterialCalculation = {
    kind: "beam-runs",
    inputs: { runs: groups.length },
    verified: false,
    runLabels: {},
    specifications: {},
    specificationSources: {},
    lengthSources: {},
    arrangements: {},
    runCountSource: `${groups.length} proposed distinct physical beam lines from spatial drawing associations; repeated labels are not additional beams. Contractor verification required.`,
  };
  groups.forEach((group, index) => {
    const b = group[0],
      n = index + 1,
      key = String(n);
    // Beam 1 is a review identifier, never represented as an original drawing label.
    recipe.runLabels![key] = b.drawingLabel || `Proposed line ${n}`;
    recipe.specifications![key] = b.specification;
    recipe.specificationSources![key] = [
      ...new Set(
        group.map(
          (b) =>
            `${item.sourceDocumentName || item.documentId} · page ${b.page} · ${b.sheet}: ${b.evidence}`,
        ),
      ),
    ]
      .join("; ")
      .slice(0, 2000);
    const plies = b.specification.match(/\b(\d+)\s*[- ]?ply\b/i);
    if (plies) recipe.inputs[`plies${n}`] = Number(plies[1]);
    const length = spatialBeamLength(item, group);
    if (length) {
      recipe.inputs[`length${n}`] = length.feet;
      recipe.lengthSources![key] =
        `${length.written} · ${length.references.join("; ")}`.slice(0, 2000);
    }
  });
  return validCalculation(recipe) ? recipe : null;
}

export function spatialBeamReviewProblem(item: TakeoffItem) {
  const beams = item.beamAssemblies ?? [];
  const overlap = spatialBeamOverlap(beams);
  if (overlap) return overlap;
  for (const group of uniqueSpatialBeams(
    beams.filter((b) => b.scope === "New work"),
  ))
    if (new Set(spatialLengths(item, group).map((l) => l.feet)).size > 1)
      return "Conflicting full beam lengths: compare the drawing references and confirm the correct assembly length.";
  return "";
}
