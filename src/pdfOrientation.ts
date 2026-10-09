import { normalizeRotation } from "../shared/pdf";
import type { PdfRotation, PdfDetailRegion } from "../shared/pdf";
export type TextDirection = { str: string; transform: number[] };
// Use embedded text baselines, not OCR or guessed construction information.
export function readableRotation(intrinsic: number, items: TextDirection[]) {
  const weights = [0, 0, 0, 0];
  for (const item of items) {
    const angle =
      (Math.atan2(item.transform[1], item.transform[0]) * 180) / Math.PI;
    const turn = Math.round(angle / 90);
    if (Math.abs(angle - turn * 90) > 12) continue;
    const characters = item.str.replace(/\s/g, "").length;
    if (characters < 3) continue;
    weights[normalizeRotation(turn * 90) / 90] += characters;
  }
  const total = weights.reduce((a, b) => a + b, 0);
  const best = weights.indexOf(Math.max(...weights));
  // PDF text angles are counter-clockwise; PDF.js viewport rotations clockwise.
  const reliable = total >= 12 && weights[best] / total >= 0.7;
  return {
    rotation: reliable
      ? normalizeRotation(best * 90)
      : normalizeRotation(intrinsic),
    reliable,
  };
}
export function rotateDetailBounds(
  region: PdfDetailRegion,
  clockwise: 90 | -90,
): PdfDetailRegion {
  return {
    ...region,
    x:
      clockwise === 90
        ? region.pageHeight - region.y - region.height
        : region.y,
    y: clockwise === 90 ? region.x : region.pageWidth - region.x - region.width,
    width: region.height,
    height: region.width,
    pageWidth: region.pageHeight,
    pageHeight: region.pageWidth,
    rotation: normalizeRotation(
      (region.rotation ?? 0) + clockwise,
    ) as PdfRotation,
  };
}
