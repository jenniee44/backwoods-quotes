import type { AnalysisDocument } from "../shared/analysis";
import type { PdfDetailRegion } from "../shared/pdf";
import {
  analysisPackageSize,
  dataBytes,
  detailOptimizationTarget,
  maxAnalysisBytes,
} from "../shared/analysisPackage";

// Encoding changes only; never resize pixels or alter original sources.
export function encodeDetailCanvas(
  canvas: HTMLCanvasElement,
  maximum = 2_000_000,
): Pick<PdfDetailRegion, "data" | "encoding" | "quality"> {
  const png = canvas.toDataURL("image/png");
  if (dataBytes(png) <= maximum) return { data: png }; // Preserve compact linework losslessly.
  for (const quality of [0.96, 0.92]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (dataBytes(data) <= maximum) return { data, encoding: "JPEG", quality };
  }
  throw new Error(
    "This detail exceeds 2 MB even at high JPEG quality (92%). Zoom into a smaller region; original files and 250 DPI pixels are never reduced.",
  );
}

export async function optimizeAnalysisPackage(
  documents: AnalysisDocument[],
  signal?: AbortSignal,
): Promise<AnalysisDocument[]> {
  signal?.throwIfAborted();
  const result = documents.map((d) => ({
    ...d,
    ...(d.detailRegions
      ? { detailRegions: d.detailRegions.map((r) => ({ ...r })) }
      : {}),
  }));
  if (analysisPackageSize(result).originals > maxAnalysisBytes) return result;
  if (analysisPackageSize(result).total <= detailOptimizationTarget)
    return result;
  // Work one image at a time; keep source/crop/page/rotation/index unchanged.
  for (const quality of [0.96, 0.92]) {
    for (
      let documentIndex = 0;
      documentIndex < result.length;
      documentIndex++
    ) {
      const source = result[documentIndex];
      for (
        let index = 0;
        index < (source.detailRegions?.length ?? 0);
        index++
      ) {
        signal?.throwIfAborted();
        if (analysisPackageSize(result).total <= detailOptimizationTarget)
          return result;
        // Always encode from the captured original-operator render, not a previous JPEG.
        const original = documents[documentIndex].detailRegions![index];
        if (
          original.encoding === "JPEG" &&
          quality >= (original.quality ?? 0.96)
        )
          continue;
        const image = new Image();
        image.src = original.data;
        await image.decode();
        signal?.throwIfAborted();
        const canvas = document.createElement("canvas");
        canvas.width = original.pixelWidth;
        canvas.height = original.pixelHeight;
        try {
          const context = canvas.getContext("2d");
          if (!context)
            throw new Error(
              "Detail optimization is unavailable in this browser. Remove a detail view or select fewer sources.",
            );
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          const data = canvas.toDataURL("image/jpeg", quality);
          const current = source.detailRegions![index];
          if (dataBytes(data) < dataBytes(current.data))
            source.detailRegions![index] = {
              ...original,
              data,
              encoding: "JPEG",
              quality,
            };
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          image.src = "";
        }
      }
    }
    // Don't compress further when 96% quality already fits the hard budget.
    if (analysisPackageSize(result).total <= maxAnalysisBytes) break;
  }
  return result;
}
