import type { AnalysisDocument } from "../shared/analysis";
const keys = (documents: AnalysisDocument[]) =>
  documents.flatMap((d) =>
    (d.detailRegions ?? []).map((r) =>
      JSON.stringify([
        d.id,
        r.page,
        r.rotation ?? 0,
        r.x,
        r.y,
        r.width,
        r.height,
        r.dpi,
        r.pixelWidth,
        r.pixelHeight,
      ]),
    ),
  );
export function assertDetailInclusion(
  expected: AnalysisDocument[],
  actual: AnalysisDocument[],
) {
  if (JSON.stringify(keys(expected)) !== JSON.stringify(keys(actual)))
    throw new Error(
      "Selected detail views are missing from the analysis package. Restore detail selection or regenerate the views before analysis. No request was sent.",
    );
  if (
    expected.length !== actual.length ||
    expected.some(
      (d) => !actual.some((a) => a.id === d.id && a.data === d.data),
    )
  )
    throw new Error(
      "An original source is missing or changed in the analysis package. Reselect the original PDF before analysis.",
    );
}
