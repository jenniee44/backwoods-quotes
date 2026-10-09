import type { PDFPageProxy } from "pdfjs-dist";
import type { PdfDetailRegion, PdfRotation } from "../shared/pdf";
import { normalizeRotation } from "../shared/pdf";
import type { TextDirection } from "./pdfOrientation";
export type PreparedDetail = PdfDetailRegion & {
  inspectionNote?: string;
  reviewGroup?: string;
};
export type PositionedText = TextDirection & { width: number; height: number };
export const constructionText =
  /footing|foundation|beam|joist|post|framing|connection|hanger|ledger|stair|guard|railing|specification|construction|notes?|spacing|lumber|concrete|schedule|\d+\s*(?:ft|in\b|mm|cm|["′″'])/i;
export const administrativeText =
  /drawn by|checked by|copyright|revision|project address|sheet\s*(?:no|number|\d)|drawing\s*(?:no|number)|scale\s*[:\d]|do not scale|\bdate\b/i;
export function textBounds(
  item: PositionedText,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
) {
  const length = Math.hypot(item.transform[0], item.transform[1]) || 1;
  const dx = item.transform[0] / length,
    dy = item.transform[1] / length;
  const corners = [
    [0, 0],
    [item.width, 0],
    [0, item.height],
    [item.width, item.height],
  ].map(([a, b]) =>
    viewport.convertToViewportPoint(
      item.transform[4] + a * dx - b * dy,
      item.transform[5] + a * dy + b * dx,
    ),
  );
  const x = Math.min(...corners.map((c) => c[0])),
    y = Math.min(...corners.map((c) => c[1]));
  return {
    x,
    y,
    width: Math.max(...corners.map((c) => c[0])) - x,
    height: Math.max(...corners.map((c) => c[1])) - y,
  };
}
export function intersects(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}
export function chooseDetailOrientation(
  fallback: PdfRotation,
  items: PositionedText[],
) {
  const scores = [0, 90, 180, 270].map((rotation) => ({
    rotation: rotation as PdfRotation,
    weight: 0,
  }));
  let unsupported = false;
  let total = 0;
  for (const item of items) {
    if (!item.str.trim() || administrativeText.test(item.str)) continue;
    // Reflected or degenerate text cannot be made reliably upright by a quarter turn.
    if (
      item.transform[0] * item.transform[3] -
        item.transform[1] * item.transform[2] <=
      0
    ) {
      unsupported = true;
      continue;
    }
    const angle =
      (Math.atan2(item.transform[1], item.transform[0]) * 180) / Math.PI;
    const weight =
      Math.min(120, item.str.replace(/\s/g, "").length) *
      (constructionText.test(item.str) ? 4 : 1) *
      (item.height <= 10 ? 1.5 : 1);
    total += weight;
    for (const score of scores) {
      const distance = Math.abs(((angle - score.rotation + 540) % 360) - 180);
      if (distance <= 12) score.weight += weight;
    }
  }
  const ranked = [...scores].sort((a, b) => b.weight - a.weight);
  const reliable =
    !unsupported && total >= 12 && ranked[0].weight / total >= 0.75;
  return {
    rotation: reliable ? ranked[0].rotation : fallback,
    reliable,
    scores,
  };
}
export function orientDetail<
  T extends Pick<PdfDetailRegion, "x" | "y" | "width" | "height" | "label"> & {
    rotation?: number;
  },
>(page: Pick<PDFPageProxy, "getViewport">, region: T, items: PositionedText[]) {
  const old = page.getViewport({ scale: 1, rotation: region.rotation ?? 0 });
  const local = items.filter((item) =>
    intersects(region, textBounds(item, old)),
  );
  const choice = chooseDetailOrientation(
    normalizeRotation(region.rotation ?? 0),
    local,
  );
  const next = page.getViewport({ scale: 1, rotation: choice.rotation });
  const corners = [
    [region.x, region.y],
    [region.x + region.width, region.y],
    [region.x, region.y + region.height],
    [region.x + region.width, region.y + region.height],
  ].map(([x, y]) =>
    next.convertToViewportPoint(
      ...(old.convertToPdfPoint(x, y) as [number, number]),
    ),
  );
  const x = Math.max(0, Math.min(...corners.map((c) => c[0]))),
    y = Math.max(0, Math.min(...corners.map((c) => c[1])));
  return {
    ...region,
    x,
    y,
    width: Math.min(next.width - x, Math.max(...corners.map((c) => c[0])) - x),
    height: Math.min(
      next.height - y,
      Math.max(...corners.map((c) => c[1])) - y,
    ),
    pageWidth: next.width,
    pageHeight: next.height,
    rotation: choice.rotation,
    inspectionNote: choice.reliable
      ? "Text direction checked for this detail. Verify legibility before analysis."
      : "Orientation uncertain — inspect and rotate this detail manually. No OCR guesses.",
    reviewGroup: region.label || "Manual details",
  };
}
