import type { SpatialBeam, BeamDimension } from "./spatialBeams";
export function syntheticDeckBeams(): SpatialBeam[] {
  return [0.3, 0.5, 0.7].map((y, i) => ({
    page: 1,
    sheet: "S1.0",
    drawingLabel: "",
    start: { x: 0.2, y },
    end: { x: 0.8, y },
    specification: "3PLY 2X10 PT",
    labels: [0.3, 0.5, 0.7].map((x) => ({
      text: "3PLY 2X10 PT",
      point: { x, y: y - 0.01 },
    })),
    supports: [0.2, 0.4, 0.6, 0.8].map((x) => ({
      point: { x, y },
      evidence: `Support symbol at drawing x=${x}; scope/count must be verified separately`,
    })),
    dimensions: [
      {
        written: "24'-3\"",
        role: "Overall",
        association: "Explicit endpoints",
        start: { x: 0.1, y: 0.12 },
        end: { x: 0.9, y: 0.12 },
        evidence:
          "Overall horizontal drawing dimension; not an individual beam length",
      },
      {
        written: "8'-0\"",
        role: "Support spacing",
        association: "Explicit endpoints",
        start: { x: 0.2, y: y - 0.04 },
        end: { x: 0.4, y: y - 0.04 },
        evidence: `Support-to-support spacing associated with this beam line ${i + 1}`,
      },
    ],
    scope: "New work",
    confidence: "High",
    evidence: `Distinct parallel framing line ${i + 1} with three repeated ply labels; original framing plan`,
  }));
}
export function fullDimension(
  beam: SpatialBeam,
  written = "12'-0\"",
): BeamDimension {
  return {
    written,
    role: "Full beam length",
    association: "Explicit endpoints",
    start: { x: beam.start.x, y: beam.start.y - 0.03 },
    end: { x: beam.end.x, y: beam.end.y - 0.03 },
    evidence:
      "Written dimension extension endpoints explicitly identify both ends of this complete beam",
  };
}
