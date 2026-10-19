import {
  overlap,
  type DetailSuggestion,
  type TextMark,
} from "./autoDetailRegions";
import {
  administrativeText,
  criticalDrawingWarning,
  intersects,
} from "./detailReadability";
import {
  contentRegions,
  regionInk,
  type DrawingSurvey,
} from "./drawingContent";
// Reading windows, not measured construction geometry. Never grow a window to
// an entire connected framing grid: that can make its annotations small again.
const topics: [string, RegExp][] = [
  ["Beam / support association", /beam|girder|\d+\s*[- ]?ply|\bplies\b/i],
  ["Joists / framing", /joist|framing|ledger|blocking|rim/i],
  ["Footings / posts", /footing|pier|pile|foundation|post/i],
  [
    "Connections / callouts",
    /hanger|connector|connection|LUS\d|fastener|detail|section/i,
  ],
  ["Dimensions", /\d+\s*(?:ft|in\b|mm|cm|["′″'])/i],
  ["Stairs / guards", /stair|landing|tread|riser|guard|railing/i],
  [
    "Decking / specifications",
    /deck|board|fascia|note|specification|schedule/i,
  ],
];
export function analysisPageRegions(
  page: number,
  width: number,
  height: number,
  marks: TextMark[],
  survey: DrawingSurvey,
): DetailSuggestion[] {
  const seeds = marks.filter(
    (m) =>
      m.text.trim() &&
      (!administrativeText.test(m.text) ||
        criticalDrawingWarning.test(m.text)) &&
      [m.x, m.y, m.width, m.height].every(Number.isFinite),
  );
  const candidates = seeds.flatMap((m) => {
    const topic = topics.find(([, re]) => re.test(m.text));
    // Small normal pages with large readable text don't need automatic images.
    if (!topic || (Math.max(width, height) <= 900 && m.height > 9)) return [];
    const w = Math.min(width, Math.max(420, Math.min(700, m.width + 120))),
      h = Math.min(height, 340);
    const r = {
      page,
      x: Math.max(0, Math.min(width - w, m.x + m.width / 2 - w / 2)),
      y: Math.max(0, Math.min(height - h, m.y + m.height / 2 - h / 2)),
      width: w,
      height: h,
      label: topic[0],
      score:
        20 +
        (m.height <= 9 ? 8 : 0) +
        (/Beam|Dimensions|Connections/.test(topic[0]) ? 6 : 0),
    };
    r.label = [
      ...new Set(
        seeds
          .filter((mark) => intersects(r, mark))
          .flatMap((mark) => {
            const match = topics.find(([, re]) => re.test(mark.text));
            return match ? [match[0]] : [];
          }),
      ),
    ]
      .join(" + ")
      .slice(0, 120);
    return regionInk(survey, r, width, height) >= 8 ? [r] : [];
  });
  // Scans have no trustworthy text anchors. Occupied-linework windows remain
  // optional visual aids; no OCR or invented specification/measurement is added.
  return candidates.length || marks.some((m) => m.text.trim())
    ? candidates
    : contentRegions(page, width, height, [], survey).map((r) => ({
        ...r,
        score: 4,
      }));
}
export function selectAnalysisRegions(
  candidates: DetailSuggestion[],
  limit: number,
  existing: DetailSuggestion[] = [],
) {
  const selected: DetailSuggestion[] = [];
  while (selected.length < Math.min(8, Math.max(0, limit))) {
    const eligible = candidates.filter(
      (c) => ![...selected, ...existing].some((p) => overlap(c, p) > 0.45),
    );
    const value = (r: DetailSuggestion) =>
      r.score /
      (1 +
        selected.filter((p) => p.page === r.page).length * 0.65 +
        selected.filter((p) => p.label === r.label).length * 0.8);
    eligible.sort(
      (a, b) =>
        value(b) - value(a) || a.page - b.page || a.y - b.y || a.x - b.x,
    );
    if (!eligible.length) break;
    selected.push(eligible[0]);
  }
  return selected;
}
