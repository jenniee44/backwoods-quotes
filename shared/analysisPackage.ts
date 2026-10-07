import type { AnalysisDocument } from "./analysis";
// Application budgets, not provider/platform limits. Keep bounded base64/JSON
// copies well below the Worker memory budget; originals keep their 2 MB cap.
export const maxAnalysisBytes = 8_000_000;
export const maxAnalysisBodyBytes = 12_000_000;
export const detailOptimizationTarget = maxAnalysisBytes;
export function dataBytes(data: string): number {
  const base64 = data.slice(data.indexOf(",") + 1);
  return (
    Math.floor((base64.length * 3) / 4) -
    (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0)
  );
}
export function analysisPackageSize(documents: AnalysisDocument[]) {
  const originals = documents.reduce((sum, d) => sum + dataBytes(d.data), 0);
  const details = documents.reduce(
    (sum, d) =>
      sum + (d.detailRegions ?? []).reduce((n, r) => n + dataBytes(r.data), 0),
    0,
  );
  return {
    originals,
    details,
    total: originals + details,
    detailCount: documents.reduce(
      (n, d) => n + (d.detailRegions?.length ?? 0),
      0,
    ),
  };
}
export function packageProblem(documents: AnalysisDocument[]): string {
  const size = analysisPackageSize(documents);
  if (size.total > maxAnalysisBytes) {
    const reason =
      size.originals > maxAnalysisBytes
        ? "Original files alone exceed the budget; detail optimization cannot reduce originals."
        : "High-quality detail optimization has reached its safe limit.";
    return `Analysis package is ${(size.total / 1_000_000).toFixed(2)} MB; allowed size is 8 MB. ${reason} Remove a listed detail view or deselect a source; no files or views are discarded automatically.`;
  }
  return "";
}
