import { createContext } from "react";
import type { SpatialBeam } from "../shared/spatialBeams";
export type DrawingLocation = {
  documentId: string;
  beam: SpatialBeam;
  request: number;
};
// Transient viewer navigation only: never stored in quotes or customer documents.
export const DrawingLocationContext = createContext<
  ((documentId: string, beam: SpatialBeam) => void) | null
>(null);
export function rotatedDrawingPoint(
  p: { x: number; y: number },
  rotation: number,
) {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: 1 - p.y, y: p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: p.y, y: 1 - p.x };
    default:
      return p;
  }
}
