// Bounded selectable text geometry, in normalized original-page viewport coordinates.
export type PositionedPdfText = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};
export const maxPositionedTextChars = 30000;
export function positionedPdfText(
  items: unknown[],
  viewport: { width: number; height: number; transform: number[] },
  budget: number,
) {
  const runs: PositionedPdfText[] = [];
  let used = 0,
    truncated = false;
  const m = viewport.transform;
  for (const raw of items) {
    const t = raw as { str?: string; transform?: number[]; width?: number };
    if (
      !t.str?.trim() ||
      !t.transform ||
      t.transform.length !== 6 ||
      !t.transform.every(Number.isFinite) ||
      !Number.isFinite(t.width)
    )
      continue;
    if (
      runs.length >= 160 ||
      used + t.str.length > Math.min(4000, budget) ||
      t.str.length > 300
    ) {
      truncated = true;
      continue;
    }
    const [a, b, c, d, e, f] = t.transform,
      norm = Math.hypot(a, b);
    if (!norm || !m || m.length !== 6) continue;
    const convert = (x: number, y: number) => ({
      x: (m[0] * x + m[2] * y + m[4]) / viewport.width,
      y: (m[1] * x + m[3] * y + m[5]) / viewport.height,
    });
    const w = t.width!,
      corners = [
        convert(e, f),
        convert(e + (a / norm) * w, f + (b / norm) * w),
        convert(e + c, f + d),
        convert(e + (a / norm) * w + c, f + (b / norm) * w + d),
      ];
    const x = Math.max(0, Math.min(...corners.map((p) => p.x))),
      y = Math.max(0, Math.min(...corners.map((p) => p.y)));
    const right = Math.min(1, Math.max(...corners.map((p) => p.x))),
      bottom = Math.min(1, Math.max(...corners.map((p) => p.y)));
    if (
      ![x, y, right, bottom].every(Number.isFinite) ||
      right <= x ||
      bottom <= y
    )
      continue;
    const start = convert(e, f),
      end = convert(e + a, f + b);
    runs.push({
      text: t.str,
      x,
      y,
      width: right - x,
      height: bottom - y,
      angle:
        ((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI + 360) %
        360,
    });
    used += t.str.length;
  }
  return { runs, truncated, used };
}
export function validTextPositions(
  value: unknown,
): value is PositionedPdfText[] {
  return (
    Array.isArray(value) &&
    value.length <= 160 &&
    value.every(
      (v) =>
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        Object.keys(v).every((k) =>
          ["text", "x", "y", "width", "height", "angle"].includes(k),
        ) &&
        typeof v.text === "string" &&
        v.text.length <= 300 &&
        [v.x, v.y, v.width, v.height, v.angle].every(Number.isFinite) &&
        v.x >= 0 &&
        v.y >= 0 &&
        v.width > 0 &&
        v.height > 0 &&
        v.x + v.width <= 1.000001 &&
        v.y + v.height <= 1.000001 &&
        v.angle >= 0 &&
        v.angle < 360,
    ) &&
    value.reduce((sum, v) => sum + v.text.length, 0) <= 4000
  );
}
