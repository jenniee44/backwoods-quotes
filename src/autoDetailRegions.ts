// Region suggestions locate source content; they never infer site measurements.
export type TextMark = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type DetailSuggestion = {
  rotation?: number;
  pageWidth?: number;
  pageHeight?: number;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  score: number;
};
const topics: [string, RegExp][] = [
  ["Foundations & footings", /foundation|footing|pier|pile/i],
  ["Framing & connections", /fram|beam|joist|post|ledger|connection|hanger/i],
  ["Stairs & landings", /stair|landing|tread|riser/i],
  ["Guards & railings", /guard|railing|baluster/i],
  ["Specifications & schedules", /spec|note|schedule|material|callout/i],
  ["Elevations & sections", /elevation|section|detail/i],
  ["Written dimensions", /\d+\s*(?:ft|in\b|mm|cm|["′″'])/i],
];
function canonical(r: DetailSuggestion) {
  if (!r.pageWidth || !r.pageHeight) return r;
  switch (r.rotation ?? 0) {
    case 90:
      return {
        ...r,
        x: r.y,
        y: r.pageWidth - r.x - r.width,
        width: r.height,
        height: r.width,
      };
    case 180:
      return {
        ...r,
        x: r.pageWidth - r.x - r.width,
        y: r.pageHeight - r.y - r.height,
      };
    case 270:
      return {
        ...r,
        x: r.pageHeight - r.y - r.height,
        y: r.x,
        width: r.height,
        height: r.width,
      };
    default:
      return r;
  }
}
export function overlap(first: DetailSuggestion, second: DetailSuggestion) {
  if (first.page !== second.page) return 0;
  if (
    (first.rotation ?? 0) !== (second.rotation ?? 0) &&
    (!first.pageWidth || !second.pageWidth)
  )
    return 0;
  const a = canonical(first),
    b = canonical(second);
  const area =
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / Math.min(a.width * a.height, b.width * b.height);
}
export function suggestPageRegions(
  page: number,
  width: number,
  height: number,
  marks: TextMark[],
): DetailSuggestion[] {
  const crop = (
    x: number,
    y: number,
    label: string,
    score: number,
  ): DetailSuggestion => {
    const w = Math.min(560, width),
      h = Math.min(380, height);
    return {
      page,
      x: Math.max(0, Math.min(width - w, x - w / 2)),
      y: Math.max(0, Math.min(height - h, y - h / 2)),
      width: w,
      height: h,
      label,
      score,
    };
  };
  const candidates = marks
    .filter(
      (m) => Number.isFinite(m.x) && Number.isFinite(m.y) && m.text.trim(),
    )
    .flatMap((m) => {
      const topic = topics.find(([, pattern]) => pattern.test(m.text));
      return topic || m.height <= 10
        ? [
            crop(
              m.x + Math.min(m.width, 300) / 2,
              m.y,
              topic?.[0] ?? "Small selectable text",
              (topic ? 10 : 2) + (m.height <= 10 ? 4 : 0),
            ),
          ]
        : [];
    });
  return candidates;
}
export function selectDetailRegions(
  candidates: DetailSuggestion[],
  limit = 20,
  existing: DetailSuggestion[] = [],
) {
  const chosen: DetailSuggestion[] = [];
  for (const c of [...candidates].sort(
    (a, b) => b.score - a.score || a.page - b.page || a.y - b.y,
  )) {
    if (chosen.length >= Math.min(20, Math.max(0, limit))) break;
    if ([...existing, ...chosen].some((p) => overlap(c, p) > 0.45)) continue;
    chosen.push(c);
  }
  return chosen;
}
