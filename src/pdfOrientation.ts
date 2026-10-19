import { chooseDetailOrientation } from "./detailReadability";
import { normalizeRotation } from "../shared/pdf";
import type { PdfRotation, PdfDetailRegion } from "../shared/pdf";
export type TextDirection = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};
// Use embedded text baselines, not OCR or guessed construction information.
export function readableRotation(intrinsic: number, items: TextDirection[]) {
  const choice = chooseDetailOrientation(
    normalizeRotation(intrinsic),
    items.map((item) => ({
      ...item,
      width: item.width ?? 1,
      height: item.height ?? 6,
    })),
  );
  return {
    rotation: choice.reliable ? choice.rotation : normalizeRotation(intrinsic),
    reliable: choice.reliable,
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
