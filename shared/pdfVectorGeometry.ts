// Original-page normalized PDF path coordinates, never site dimensions or material counts.
export type PdfVectorGeometry = {
  segments: number[][];
  boxes: number[][];
  truncated: boolean;
};
export function validVectorGeometry(v: unknown): v is PdfVectorGeometry {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const g = v as PdfVectorGeometry;
  const list = (a: unknown, max: number) =>
    Array.isArray(a) &&
    a.length <= max &&
    a.every(
      (r) =>
        Array.isArray(r) &&
        r.length === 4 &&
        r.every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
        ),
    );
  return (
    Object.keys(g).every((k) =>
      ["segments", "boxes", "truncated"].includes(k),
    ) &&
    typeof g.truncated === "boolean" &&
    list(g.segments, 160) &&
    list(g.boxes, 32)
  );
}
