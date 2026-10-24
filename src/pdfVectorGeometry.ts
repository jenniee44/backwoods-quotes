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
  const candidates: number[][] = [];
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
  const geometryKey = (r: number[]) => {
    const v = r.map((n) => Math.round(n * 1e6) / 1e6);
    return (
      v[0] < v[2] || (v[0] === v[2] && v[1] <= v[3])
        ? v
        : [v[2], v[3], v[0], v[1]]
    ).join(",");
  };
  const seedKeys = new Set<string>();
  const candidateKeys = new Set<string>();
  const anchors = labels.filter((l) =>
    /\b\d+\s*[- ]?ply\b|\b(?:beams?|girders?|joists?|ledgers?|footings?|posts?|stairs?|decking)\b/i.test(
      l.text,
    ),
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
    for (const r of lines) {
      if (valid(r) && Math.hypot(r[2] - r[0], r[3] - r[1]) >= 0.02) {
        const key = geometryKey(r);
        if (!candidateKeys.has(key)) {
          if (candidates.length < 1200) {
            candidateKeys.add(key);
            candidates.push(r);
          } else truncated = true;
        }
      }
      if (
        valid(r) &&
        Math.hypot(r[2] - r[0], r[3] - r[1]) >= 0.02 &&
        anchors.some(
          (l) => near([l.x + l.width / 2, l.y + l.height / 2], r) < 0.035,
        )
      ) {
        const key = geometryKey(r);
        if (!seedKeys.has(key)) {
          if (segments.length < 160) {
            seedKeys.add(key);
            segments.push(r);
          } else truncated = true;
        }
      }
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
  // Keep actual connected collinear strokes even when only one span has a label.
  // This does not create centerlines, bridge gaps or classify members/supports.
  const connected = (a: number[], b: number[]) => {
    const dx = a[2] - a[0],
      dy = a[3] - a[1],
      length = Math.hypot(dx, dy);
    const off = (x: number, y: number) =>
      Math.abs((x - a[0]) * dy - (y - a[1]) * dx) / length;
    if (off(b[0], b[1]) > 0.001 || off(b[2], b[3]) > 0.001) return false;
    return (
      Math.min(
        ...[0, 2].flatMap((i) =>
          [0, 2].map((j) => Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1])),
        ),
      ) <= 0.002
    );
  };
  const retained = new Set(segments.map(geometryKey));
  for (let pass = 0; pass < 8; pass++) {
    const additions = candidates.filter(
      (r) =>
        !retained.has(geometryKey(r)) && segments.some((s) => connected(s, r)),
    );
    if (!additions.length) break;
    for (const r of additions) {
      if (retained.has(geometryKey(r))) continue;
      if (segments.length >= 160) {
        truncated = true;
        break;
      }
      segments.push(r);
      retained.add(geometryKey(r));
    }
    if (segments.length >= 160) break;
    if (pass === 7) truncated = true;
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
