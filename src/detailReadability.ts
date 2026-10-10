import type { PDFPageProxy } from "pdfjs-dist";
import type { PdfDetailRegion, PdfRotation } from "../shared/pdf";
import { normalizeRotation } from "../shared/pdf";
import type { TextDirection } from "./pdfOrientation";
export type PreparedDetail = PdfDetailRegion & {
  inspectionNote?: string;
  reviewGroup?: string;
  orientationUncertain?: boolean;
  cropNeedsReview?: boolean;
};
export type PositionedText = TextDirection & { width: number; height: number };
export const constructionText =
  /footing|foundation|beam|joist|post|framing|connection|hanger|anchor|fastener|ledger|stair|guard|railing|specification|construction|notes?|spacing|lumber|concrete|schedule|\d+\s*(?:ft|in\b|mm|cm|["′″'])/i;
export const criticalDrawingWarning =
  /do not scale|verify.*(?:site|field)|not for construction|preliminary|superseded|revision\s+(?:\d+|[A-Z]\b)|engineer.*verify|contractor.*verify|existing conditions|by others|not in contract|hold for|construction status/i;
export const memberAnnotation =
  /joist|beam|post|footing|foundation|ledger|hanger|connection|ply|plies|pressure treated|\bPT\b|specification/i;
export const administrativeText =
  /drawn by|checked by|copyright|revision|project address|sheet\s*(?:no|number|\d)|drawing\s*(?:no|number)|scale\s*[:\d]|do not scale|\bdate\b/i;
export function textBounds(
  item: PositionedText,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
) {
  const length = Math.hypot(item.transform[0], item.transform[1]) || 1;
  const dx = item.transform[0] / length,
    dy = item.transform[1] / length;
  const vertical = Math.hypot(item.transform[2], item.transform[3]) || length;
  const vx = item.transform[2] / vertical,
    vy = item.transform[3] / vertical;
  const corners = [
    [0, 0],
    [item.width, 0],
    [0, item.height],
    [item.width, item.height],
  ].map(([a, b]) =>
    viewport.convertToViewportPoint(
      item.transform[4] + a * dx + b * vx,
      item.transform[5] + a * dy + b * vy,
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
  items: (PositionedText & { coverage?: number })[],
) {
  const scores = [0, 90, 180, 270].map((rotation) => ({
    rotation: rotation as PdfRotation,
    weight: 0,
  }));
  let unsupported = false;
  let total = 0;
  const seen = new Set<string>();
  for (const item of items) {
    // Duplicate text overlays must not outvote separate physical annotations.
    const identity = JSON.stringify([item.str.trim(), item.transform]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    if (
      !item.str.trim() ||
      (administrativeText.test(item.str) &&
        !criticalDrawingWarning.test(item.str))
    )
      continue;
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
      Math.min(40, item.str.replace(/\s/g, "").length) *
      (memberAnnotation.test(item.str)
        ? 8
        : constructionText.test(item.str)
          ? 2
          : 1) *
      (item.coverage ?? 1) *
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
  const matched = scores.reduce((sum, score) => sum + score.weight, 0);
  // A supported majority may offer a useful view without being claimed reliable.
  // Ties, scans, reflections and oblique text keep the source orientation.
  const suggested =
    !unsupported &&
    total >= 12 &&
    matched / total >= 0.9 &&
    ranked[0].weight / total >= 0.55 &&
    ranked[0].weight > ranked[1].weight;
  return {
    rotation: reliable || suggested ? ranked[0].rotation : fallback,
    reliable,
    suggested: suggested && !reliable,
    scores,
  };
}
export function orientDetail<
  T extends Pick<PdfDetailRegion, "x" | "y" | "width" | "height" | "label"> & {
    rotation?: number;
  },
>(page: Pick<PDFPageProxy, "getViewport">, region: T, items: PositionedText[]) {
  const old = page.getViewport({ scale: 1, rotation: region.rotation ?? 0 });
  const local = items.flatMap((item) => {
    const bounds = textBounds(item, old);
    const area =
      Math.max(
        0,
        Math.min(region.x + region.width, bounds.x + bounds.width) -
          Math.max(region.x, bounds.x),
      ) *
      Math.max(
        0,
        Math.min(region.y + region.height, bounds.y + bounds.height) -
          Math.max(region.y, bounds.y),
      );
    const coverage = area / Math.max(1, bounds.width * bounds.height);
    // A clipped annotation outside this crop must not decide its reading direction.
    return coverage >= 0.6 ? [{ ...item, coverage }] : [];
  });
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
    orientationUncertain: !choice.reliable,
    inspectionNote: choice.reliable
      ? "Text direction checked for this detail. Verify legibility before analysis."
      : choice.suggested
        ? "Mixed text directions — suggested orientation needs manual inspection. Rotate if necessary."
        : "Orientation uncertain — inspect and rotate this detail manually. No OCR guesses.",
    reviewGroup: region.label || "Manual details",
  };
}
