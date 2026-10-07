// Physical PDF coordinates in the rotated page viewport, top-left origin, at
// scale=1 (72 points/inch). These identify a detail region, NOT site measurements.
export const detailDpi = 250;
export const maxDetailPixels = 8_000_000;
export const maxDetailSide = 4096;
export const maxDetailRegions = 4;
export const maxPdfTextChars = 60_000;
export const maxAnalysisTextChars = 120_000;
export type PdfTextPage = {
  page: number;
  width: number;
  height: number;
  text: string;
  status: "Available" | "No selectable text" | "Truncated" | "Unavailable";
};
export type PdfTextLayer = {
  pageCount: number;
  pages: PdfTextPage[];
  truncated: boolean;
};
export type PdfDetailRegion = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
  dpi: number;
  pixelWidth: number;
  pixelHeight: number;
  data: string;
};
export function detailRenderSize(width: number, height: number) {
  const pixelWidth = Math.ceil((width * detailDpi) / 72);
  const pixelHeight = Math.ceil((height * detailDpi) / 72);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    pixelWidth > maxDetailSide ||
    pixelHeight > maxDetailSide ||
    pixelWidth * pixelHeight > maxDetailPixels
  )
    throw new Error(
      "This detail view is too large to render at 250 DPI. Zoom into a smaller region; the original PDF will not be reduced.",
    );
  return { pixelWidth, pixelHeight };
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const pageNumber = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 50;
const positive = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 20_000;
export function validPdfText(value: unknown): value is PdfTextLayer {
  if (
    !record(value) ||
    !pageNumber(value.pageCount) ||
    typeof value.truncated !== "boolean" ||
    !Array.isArray(value.pages) ||
    value.pages.length > Number(value.pageCount)
  )
    return false;
  const seen = new Set<number>();
  let chars = 0;
  for (const p of value.pages) {
    if (
      !record(p) ||
      !pageNumber(p.page) ||
      Number(p.page) > Number(value.pageCount) ||
      seen.has(Number(p.page)) ||
      !positive(p.width) ||
      !positive(p.height) ||
      typeof p.text !== "string" ||
      p.text.length > 8000 ||
      !["Available", "No selectable text", "Truncated", "Unavailable"].includes(
        String(p.status),
      )
    )
      return false;
    seen.add(Number(p.page));
    chars += p.text.length;
  }
  return chars <= maxPdfTextChars;
}
export function validatePdfRegion(value: unknown): PdfDetailRegion {
  const fail = () => {
    throw new Error(
      "The PDF detail view is invalid. Capture it again from the original drawing.",
    );
  };
  if (
    !record(value) ||
    !pageNumber(value.page) ||
    !positive(value.width) ||
    !positive(value.height) ||
    !positive(value.pageWidth) ||
    !positive(value.pageHeight) ||
    ![value.x, value.y].every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
    ) ||
    Number(value.x) + Number(value.width) > Number(value.pageWidth) + 0.01 ||
    Number(value.y) + Number(value.height) > Number(value.pageHeight) + 0.01 ||
    value.dpi !== detailDpi ||
    typeof value.data !== "string"
  )
    return fail();
  const size = detailRenderSize(Number(value.width), Number(value.height));
  if (
    value.pixelWidth !== size.pixelWidth ||
    value.pixelHeight !== size.pixelHeight
  )
    return fail();
  const prefix = "data:image/png;base64,";
  if (!value.data.startsWith(prefix) || value.data.length > 2_700_000)
    return fail();
  let bytes: string;
  try {
    bytes = atob(value.data.slice(prefix.length));
  } catch {
    return fail();
  }
  const uint = (offset: number) =>
    ((bytes.charCodeAt(offset) << 24) >>> 0) +
    (bytes.charCodeAt(offset + 1) << 16) +
    (bytes.charCodeAt(offset + 2) << 8) +
    bytes.charCodeAt(offset + 3);
  if (
    bytes.length < 24 ||
    bytes.length > 2_000_000 ||
    !bytes.startsWith("\x89PNG\r\n\x1a\n") ||
    bytes.slice(12, 16) !== "IHDR" ||
    uint(16) !== size.pixelWidth ||
    uint(20) !== size.pixelHeight
  )
    return fail();
  // Explicit projection; ignore client-only properties and arbitrary metadata.
  return {
    page: Number(value.page),
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height),
    pageWidth: Number(value.pageWidth),
    pageHeight: Number(value.pageHeight),
    dpi: detailDpi,
    ...size,
    data: value.data,
  };
}
export function previewRenderSize(
  width: number,
  height: number,
  pixelRatio: number,
) {
  // A visible viewport tile, never a full-sheet bitmap. Safari-safe allocation.
  const density = Math.min(
    Math.max(pixelRatio, 1),
    3,
    2048 / width,
    2048 / height,
  );
  return {
    density,
    pixelWidth: Math.ceil(width * density),
    pixelHeight: Math.ceil(height * density),
  };
}
