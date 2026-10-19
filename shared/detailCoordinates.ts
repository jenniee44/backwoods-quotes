import type { PdfDetailRegion } from "./pdf";
/** Exact quarter-turn mapping of source coordinates; never a drawing scale. */
export function detailSourceMapping(r: PdfDetailRegion) {
  if (r.sourcePageRotation === undefined) return undefined;
  const turn = ((r.rotation ?? 0) - r.sourcePageRotation + 360) % 360;
  const map = (x: number, y: number) => {
    const u = x / r.pageWidth,
      v = y / r.pageHeight;
    switch (turn) {
      case 90:
        return { x: v, y: 1 - u };
      case 180:
        return { x: 1 - u, y: 1 - v };
      case 270:
        return { x: 1 - v, y: u };
      default:
        return { x: u, y: v };
    }
  };
  const corners = [
    map(r.x, r.y),
    map(r.x + r.width, r.y),
    map(r.x + r.width, r.y + r.height),
    map(r.x, r.y + r.height),
  ];
  return {
    coordinateSystem:
      "Normalized original PDF page viewport; same as selectable-text positions",
    originalPageRotation: r.sourcePageRotation,
    imageCornersInOriginalPage: corners,
    bounds: {
      x: Math.min(...corners.map((p) => p.x)),
      y: Math.min(...corners.map((p) => p.y)),
      width:
        Math.max(...corners.map((p) => p.x)) -
        Math.min(...corners.map((p) => p.x)),
      height:
        Math.max(...corners.map((p) => p.y)) -
        Math.min(...corners.map((p) => p.y)),
    },
  };
}
