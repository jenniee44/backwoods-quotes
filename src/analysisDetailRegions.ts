import { detailRenderSize } from "../shared/pdf";
import { drawingAnnotation } from "./drawingAnnotations";
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
type ReadingCandidate = DetailSuggestion & { evidenceKeys?: string[] };
const evidenceKey = (page: number, m: TextMark) =>
  `${page}:${Math.round(m.x * 10)}:${Math.round(m.y * 10)}:${Math.round(m.width * 10)}:${Math.round(m.height * 10)}`;
export function analysisPageRegions(
  page: number,
  width: number,
  height: number,
  marks: TextMark[],
  survey: DrawingSurvey,
): ReadingCandidate[] {
  const seeds = marks.filter(
    (m) =>
      m.text.trim() &&
      (!administrativeText.test(m.text) ||
        criticalDrawingWarning.test(m.text)) &&
      [m.x, m.y, m.width, m.height].every(Number.isFinite),
  );
  const candidates = seeds.flatMap((m) => {
    const topic = drawingAnnotation(m.text);
    // Small normal pages with large readable text don't need automatic images.
    if (!topic.anchor || (Math.max(width, height) <= 900 && m.height > 9))
      return [];
    const w = Math.min(width, Math.max(420, Math.min(700, m.width + 120))),
      h = Math.min(height, Math.max(340, Math.min(700, m.height + 100)));
    const r: ReadingCandidate = {
      page,
      x: Math.max(0, Math.min(width - w, m.x + m.width / 2 - w / 2)),
      y: Math.max(0, Math.min(height - h, m.y + m.height / 2 - h / 2)),
      width: w,
      height: h,
      label: topic.topic,
      score: 20 + (m.height <= 9 ? 8 : 0) + topic.weight,
    };
    const local = seeds.filter(
      (mark) =>
        intersects(r, mark) &&
        drawingAnnotation(mark.text).anchor &&
        (Math.max(
          0,
          Math.min(r.x + r.width, mark.x + mark.width) - Math.max(r.x, mark.x),
        ) *
          Math.max(
            0,
            Math.min(r.y + r.height, mark.y + mark.height) -
              Math.max(r.y, mark.y),
          )) /
          Math.max(1, mark.width * mark.height) >=
          0.8,
    );
    const usefulWeight = local.reduce(
      (n, mark) => n + drawingAnnotation(mark.text).weight,
      0,
    );
    const administrative = marks.filter(
      (mark) => intersects(r, mark) && !drawingAnnotation(mark.text).meaningful,
    ).length;
    // Do not spend a crop on a heading/title cluster with one weak dimension.
    if (administrative >= 4 && usefulWeight < administrative * 2) return [];
    r.label = [
      ...new Set(local.map((mark) => drawingAnnotation(mark.text).topic)),
    ]
      .join(" + ")
      .slice(0, 120);
    r.evidenceKeys = [...new Set(local.map((mark) => evidenceKey(page, mark)))];
    r.score += Math.min(12, usefulWeight) - Math.min(12, administrative * 2);
    return regionInk(survey, r, width, height) >= 8 ? [r] : [];
  });
  // A bounded assembly-context image helps the visual model follow continuous
  // linework between repeated ply labels. Label rows DO NOT establish beam counts.
  const beamMarks = seeds.filter(
    (m) =>
      /\b(?:beams?|girders?|\d+\s*[- ]?ply)\b/i.test(m.text) &&
      drawingAnnotation(m.text).anchor,
  );
  for (const seed of beamMarks) {
    const nearby = beamMarks.filter(
      (m) => Math.abs(m.x - seed.x) <= 650 && Math.abs(m.y - seed.y) <= 450,
    );
    if (nearby.length < 2) continue;
    const x = Math.max(0, Math.min(...nearby.map((m) => m.x)) - 160);
    const y = Math.max(0, Math.min(...nearby.map((m) => m.y)) - 100);
    const right = Math.min(
      width,
      Math.max(...nearby.map((m) => m.x + m.width)) + 160,
    );
    const bottom = Math.min(
      height,
      Math.max(...nearby.map((m) => m.y + m.height)) + 100,
    );
    try {
      detailRenderSize(right - x, bottom - y);
    } catch {
      continue;
    }
    const region: ReadingCandidate = {
      page,
      x,
      y,
      width: right - x,
      height: bottom - y,
      label:
        "Beam assembly context — trace physical linework, not label counts",
      score: 55,
      evidenceKeys: nearby.map((m) => evidenceKey(page, m)),
    };
    if (regionInk(survey, region, width, height) >= 8) candidates.push(region);
  }
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
  candidates: ReadingCandidate[],
  limit = 8,
  existing: DetailSuggestion[] = [],
) {
  const selected: ReadingCandidate[] = [];
  while (selected.length < Math.min(12, Math.max(0, limit))) {
    const seen = new Set(selected.flatMap((r) => r.evidenceKeys ?? []));
    const eligible = candidates.filter(
      (c) =>
        ![...selected, ...existing].some((p) => overlap(c, p) > 0.3) &&
        (!c.evidenceKeys?.length ||
          c.evidenceKeys.some((key) => !seen.has(key))),
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
