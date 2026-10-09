import {
  administrativeText,
  constructionText,
  intersects,
} from "./detailReadability";
import { detailRenderSize } from "../shared/pdf";
import type { DetailSuggestion, TextMark } from "./autoDetailRegions";
import { suggestPageRegions } from "./autoDetailRegions";
export type DrawingSurvey = { width: number; height: number; ink: Uint8Array };
export function surveyPixels(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): DrawingSurvey {
  const ink = new Uint8Array(width * height);
  // Ignore sheet-edge borders. A survey locates pixels only; it never reads text.
  for (let y = Math.ceil(height * 0.02); y < height * 0.98; y++)
    for (let x = Math.ceil(width * 0.02); x < width * 0.98; x++) {
      const i = (y * width + x) * 4;
      ink[y * width + x] =
        rgba[i + 3] > 32 && Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) < 225
          ? 1
          : 0;
    }
  // Remove long ruling lines near the sheet edge (inset title/border frames).
  // Interior linework and notes remain available to the survey.
  const rows = new Set<number>(),
    columns = new Set<number>();
  for (let y = 0; y < height; y++)
    if (y < height * 0.1 || y > height * 0.9) {
      let count = 0;
      for (let x = 0; x < width; x++) count += ink[y * width + x];
      if (count > width * 0.7) rows.add(y);
    }
  for (let x = 0; x < width; x++)
    if (x < width * 0.1 || x > width * 0.9) {
      let count = 0;
      for (let y = 0; y < height; y++) count += ink[y * width + x];
      if (count > height * 0.7) columns.add(x);
    }
  for (const y of rows) for (let x = 0; x < width; x++) ink[y * width + x] = 0;
  for (const x of columns)
    for (let y = 0; y < height; y++) ink[y * width + x] = 0;
  return { width, height, ink };
}
export function regionInk(
  survey: DrawingSurvey,
  region: Pick<DetailSuggestion, "x" | "y" | "width" | "height">,
  width: number,
  height: number,
) {
  const left = Math.max(0, Math.floor((region.x / width) * survey.width)),
    top = Math.max(0, Math.floor((region.y / height) * survey.height));
  const right = Math.min(
      survey.width,
      Math.ceil(((region.x + region.width) / width) * survey.width),
    ),
    bottom = Math.min(
      survey.height,
      Math.ceil(((region.y + region.height) / height) * survey.height),
    );
  let count = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++)
      count += survey.ink[y * survey.width + x];
  return count;
}
export function contentRegions(
  page: number,
  width: number,
  height: number,
  marks: TextMark[],
  survey: DrawingSurvey,
): DetailSuggestion[] {
  const text = suggestPageRegions(page, width, height, marks);
  const occupied: TextMark[] = [];
  // Only occupied blocks propose crops; there is no blank-sheet coverage grid.
  const stepX = Math.max(12, Math.round((280 / width) * survey.width));
  const stepY = Math.max(12, Math.round((190 / height) * survey.height));
  for (let y = 0; y < survey.height; y += stepY)
    for (let x = 0; x < survey.width; x += stepX) {
      let count = 0,
        sx = 0,
        sy = 0;
      for (let yy = y; yy < Math.min(y + stepY, survey.height); yy++)
        for (let xx = x; xx < Math.min(x + stepX, survey.width); xx++)
          if (survey.ink[yy * survey.width + xx]) {
            count++;
            sx += xx;
            sy += yy;
          }
      if (count >= 8)
        occupied.push({
          text: "Drawing content — inspect manually",
          x: (sx / count / survey.width) * width,
          y: (sy / count / survey.height) * height,
          width: 0,
          height: 6,
        });
    }
  const visual = suggestPageRegions(page, width, height, occupied).map((r) => ({
    ...r,
    label: "Drawing content — inspect manually",
    score: 1,
  }));
  return [...text, ...visual].flatMap((r) => {
    if (regionInk(survey, r, width, height) < 8) return [];
    const local = marks.filter((m) => intersects(r, m));
    if (
      local.length &&
      local.every((m) => administrativeText.test(m.text)) &&
      !local.some(
        (m) =>
          constructionText.test(m.text) && !administrativeText.test(m.text),
      )
    )
      return [];
    let left = survey.width,
      top = survey.height,
      right = -1,
      bottom = -1;
    for (
      let y = Math.max(0, Math.floor((r.y / height) * survey.height));
      y <
      Math.min(
        survey.height,
        Math.ceil(((r.y + r.height) / height) * survey.height),
      );
      y++
    )
      for (
        let x = Math.max(0, Math.floor((r.x / width) * survey.width));
        x <
        Math.min(
          survey.width,
          Math.ceil(((r.x + r.width) / width) * survey.width),
        );
        x++
      )
        if (survey.ink[y * survey.width + x]) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    // Tighten sparse crops around observed pixels plus context, never enlarge a raster.
    const w = Math.min(
      r.width,
      Math.max(64, ((right - left + 1) / survey.width) * width + 48),
    );
    const h = Math.min(
      r.height,
      Math.max(48, ((bottom - top + 1) / survey.height) * height + 48),
    );
    let cropped = {
      ...r,
      width: w,
      height: h,
      x: Math.max(
        r.x,
        Math.min(
          r.x + r.width - w,
          ((left + right + 1) / 2 / survey.width) * width - w / 2,
        ),
      ),
      y: Math.max(
        r.y,
        Math.min(
          r.y + r.height - h,
          ((top + bottom + 1) / 2 / survey.height) * height - h / 2,
        ),
      ),
    };
    let clipped = false;
    for (const mark of local.filter((m) => !administrativeText.test(m.text))) {
      const x = Math.max(0, Math.min(cropped.x, mark.x - 18)),
        y = Math.max(0, Math.min(cropped.y, mark.y - 18));
      const right = Math.min(
          width,
          Math.max(cropped.x + cropped.width, mark.x + mark.width + 18),
        ),
        bottom = Math.min(
          height,
          Math.max(cropped.y + cropped.height, mark.y + mark.height + 18),
        );
      try {
        detailRenderSize(right - x, bottom - y);
        cropped = { ...cropped, x, y, width: right - x, height: bottom - y };
      } catch {
        clipped = true;
      }
    }
    const density =
      regionInk(survey, cropped, width, height) /
      ((((cropped.width / width) * survey.width * cropped.height) / height) *
        survey.height);
    return [
      {
        ...cropped,
        inspectionNote: clipped
          ? "A label crosses the safe crop limit — inspect the original sheet or add a smaller supporting view."
          : density < 0.005
            ? "Sparse linework / small print — inspect and zoom before including."
            : undefined,
      },
    ];
  });
}
