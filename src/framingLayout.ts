import type { TakeoffItem } from "./model";
import {
  beamGeometryProblem,
  pointToBeam,
  sameSpatialBeam,
  type DrawingPoint,
  type SpatialBeam,
  type BeamDimension,
} from "../shared/spatialBeams";
import { drawingMeasurements } from "../shared/constructionMeasurements";

const distance = (a: DrawingPoint, b: DrawingPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);
/** Drawing-space ordering/association only. Coordinates are never converted to site lengths. */
export function beamLayout(item: TakeoffItem, observations: SpatialBeam[]) {
  const beam = observations[0];
  const dx = beam.end.x - beam.start.x,
    dy = beam.end.y - beam.start.y;
  const den = dx * dx + dy * dy;
  const project = (p: DrawingPoint) =>
    den ? ((p.x - beam.start.x) * dx + (p.y - beam.start.y) * dy) / den : NaN;
  const supports: {
    point: DrawingPoint;
    evidence: string[];
    scopes: SpatialBeam["scope"][];
  }[] = [];
  for (const ob of observations.filter((b) => b.page === beam.page))
    for (const s of ob.supports) {
      if (
        !s.evidence.trim() ||
        pointToBeam(s.point, beam) > 0.025 ||
        project(s.point) < -0.01 ||
        project(s.point) > 1.01
      )
        continue;
      const existing = supports.find(
        (p) => distance(p.point, s.point) <= 0.0002,
      );
      if (existing) {
        existing.evidence = [...new Set([...existing.evidence, s.evidence])];
        existing.scopes = [
          ...new Set([
            ...existing.scopes,
            s.scope ?? "Requires scope confirmation",
          ]),
        ];
      } else
        supports.push({
          point: s.point,
          evidence: [s.evidence],
          scopes: [s.scope ?? "Requires scope confirmation"],
        });
    }
  supports.sort((a, b) => project(a.point) - project(b.point));
  const dimensions = [
    ...new Map(
      observations
        .filter((b) => b.page === beam.page)
        .flatMap((b) => b.dimensions)
        .map((d) => [JSON.stringify(d), d]),
    ).values(),
  ];
  const parse = (d: BeamDimension) => {
    if (
      d.association !== "Explicit endpoints" ||
      !d.evidence.trim() ||
      /approx|assum|uncertain|unreadable|scale|pixel|not confirmed/i.test(
        d.evidence,
      )
    )
      return null;
    const values = drawingMeasurements({
      ...item,
      page: beam.page,
      sourceFacts: [d.written],
    });
    return values.length === 1 && values[0].written.trim() === d.written.trim()
      ? values[0].inches / 12
      : null;
  };
  const spans = supports.slice(1).map((end, index) => {
    const start = supports[index];
    const a = project(start.point),
      z = project(end.point);
    const candidates = dimensions.filter((d) => {
      if (d.role !== "Span" && d.role !== "Support spacing") return false;
      const p = project(d.start),
        q = project(d.end);
      const aligned =
        Math.abs((d.end.x - d.start.x) * dy - (d.end.y - d.start.y) * dx) /
          Math.max(den, 1e-9) <
        0.02;
      // A written endpoint association must also match this support pair, not a nearby overall dimension.
      return (
        aligned &&
        ((Math.abs(p - a) < 0.02 && Math.abs(q - z) < 0.02) ||
          (Math.abs(q - a) < 0.02 && Math.abs(p - z) < 0.02))
      );
    });
    const ambiguousAssociation = candidates.some((d) => {
      const distanceTo = (b: SpatialBeam) =>
        pointToBeam(d.start, b) + pointToBeam(d.end, b);
      return (item.beamAssemblies ?? []).some(
        (other) =>
          other.page === beam.page &&
          !sameSpatialBeam(beam, other) &&
          distanceTo(other) <= distanceTo(beam) + 0.005,
      );
    });
    const lengths = candidates
      .map(parse)
      .filter((v): v is number => v !== null);
    const conflict = new Set(lengths).size > 1;
    return {
      start,
      end,
      dimensions: candidates,
      feet:
        !beamGeometryProblem(beam) &&
        lengths.length &&
        !conflict &&
        !ambiguousAssociation
          ? lengths[0]
          : null,
      conflict,
      ambiguousAssociation,
    };
  });
  return {
    supports,
    spans,
    dimensions,
    problem: beamGeometryProblem(beam),
    // This is a drawing-layout summary, never an inventory of new posts/footings or cut pieces.
    reference: `${item.sourceDocumentName || item.documentId} · ${beam.sheet || "Sheet to confirm"} · page ${beam.page}`,
  };
}
