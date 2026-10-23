import type { PdfVectorGeometry } from "../shared/pdfVectorGeometry";
import type { PositionedPdfText } from "../shared/pdfPositions";
type Matrix = number[];
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
export function vectorGeometry(
  list: { fnArray: number[]; argsArray: unknown[][] },
  ops: Record<string, number>,
  viewport: { transform: number[]; width: number; height: number },
  labels: PositionedPdfText[],
): PdfVectorGeometry {
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const segments: number[][] = [],
    boxes: number[][] = [];
  let clipped = false,
    truncated = false;
  const clipStack: boolean[] = [];
  const point = (x: number, y: number) => {
    const m = multiply(viewport.transform, matrix);
    return [
      (m[0] * x + m[2] * y + m[4]) / viewport.width,
      (m[1] * x + m[3] * y + m[5]) / viewport.height,
    ];
  };
  const valid = (p: number[]) =>
    p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
  const near = (p: number[], r: number[]) => {
    const dx = r[2] - r[0],
      dy = r[3] - r[1],
      den = dx * dx + dy * dy;
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - r[0]) * dx + (p[1] - r[1]) * dy) / den),
    );
    return Math.hypot(p[0] - r[0] - t * dx, p[1] - r[1] - t * dy);
  };
  const anchors = labels.filter((l) =>
    /\b\d+\s*[- ]?ply\b|\bbeams?\b|\bgirders?\b/i.test(l.text),
  );
  if (!anchors.length) return { segments: [], boxes: [], truncated: false };
  for (let i = 0; i < list.fnArray.length; i++) {
    if (i >= 40000) {
      truncated = true;
      break;
    }
    const op = list.fnArray[i],
      args = list.argsArray[i];
    if (op === ops.save) {
      stack.push([...matrix]);
      clipStack.push(clipped);
      continue;
    }
    if (op === ops.restore) {
      matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
      clipped = clipStack.pop() ?? false;
      continue;
    }
    if (op === ops.transform) {
      if (
        args.length === 6 &&
        args.every((n) => typeof n === "number" && Number.isFinite(n))
      )
        matrix = multiply(matrix, args as number[]);
      continue;
    }
    // Unsupported form-local coordinates/clipping are omitted, never guessed.
    if (op === ops.paintFormXObjectBegin || op === ops.beginGroup) {
      stack.push([...matrix]);
      clipStack.push(clipped);
      clipped = true;
      continue;
    }
    if (op === ops.paintFormXObjectEnd || op === ops.endGroup) {
      matrix = stack.pop() ?? matrix;
      clipped = clipStack.pop() ?? false;
      continue;
    }
    if (op === ops.clip || op === ops.eoClip) {
      clipped = true;
      continue;
    }
    if (op !== ops.constructPath || clipped) continue;
    if (
      ![
        ops.stroke,
        ops.closeStroke,
        ops.fill,
        ops.eoFill,
        ops.fillStroke,
        ops.eoFillStroke,
        ops.closeFillStroke,
        ops.closeEOFillStroke,
      ].includes(args[0] as number)
    )
      continue;
    const data = (args[1] as unknown[] | undefined)?.[0];
    if (!(Array.isArray(data) || ArrayBuffer.isView(data))) continue;
    const path = Array.from(data as ArrayLike<number>),
      lines: number[][] = [];
    let p: number[] | undefined,
      first: number[] | undefined,
      closed = false,
      curved = false;
    for (let j = 0; j < path.length;) {
      const code = path[j++];
      if (code === 0) {
        p = point(path[j++], path[j++]);
        first = p;
      } else if (code === 1) {
        const q = point(path[j++], path[j++]);
        if (p) lines.push([...p, ...q]);
        p = q;
      } else if (code === 4) {
        if (p && first) lines.push([...p, ...first]);
        closed = true;
        p = first;
      } else if (code === 2) {
        j += 6;
        p = undefined;
        curved = true;
      } else if (code === 3) {
        j += 4;
        p = undefined;
        curved = true;
      } else {
        curved = true;
        break;
      }
    }
    if (curved) continue;
    for (const r of lines)
      if (
        valid(r) &&
        Math.hypot(r[2] - r[0], r[3] - r[1]) >= 0.08 &&
        anchors.some(
          (l) => near([l.x + l.width / 2, l.y + l.height / 2], r) < 0.035,
        )
      ) {
        if (segments.length < 160) segments.push(r);
        else truncated = true;
      }
    if (closed && lines.length === 4) {
      const xs = lines.flatMap((r) => [r[0], r[2]]),
        ys = lines.flatMap((r) => [r[1], r[3]]);
      const r = [
        Math.min(...xs),
        Math.min(...ys),
        Math.max(...xs),
        Math.max(...ys),
      ];
      if (valid(r) && r[2] - r[0] < 0.03 && r[3] - r[1] < 0.03) {
        if (boxes.length < 256) boxes.push(r);
        else truncated = true;
      }
    }
  }
  const usefulBoxes = boxes.filter((b) =>
    segments.some(
      (r) => near([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], r) < 0.025,
    ),
  );
  if (usefulBoxes.length > 32) truncated = true;
  const round = (rows: number[][]) => [
    ...new Map(
      rows.map((r) => {
        const v = r.map((n) => Math.round(n * 1e6) / 1e6);
        return [v.join(","), v];
      }),
    ).values(),
  ];
  return {
    segments: round(segments),
    boxes: round(usefulBoxes.slice(0, 32)),
    truncated,
  };
}
