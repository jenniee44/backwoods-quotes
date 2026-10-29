import type {
  AnalysisDocument,
  PlanAnalysisResult,
  AnalysisSuggestion,
} from "../shared/analysis";
import { drawingMeasurements } from "../shared/constructionMeasurements";
/** Read existing selectable text only. Never OCR, scale, or assign an unlinked dimension. */
export function preserveDetectedDimensions(
  result: PlanAnalysisResult,
  documents: AnalysisDocument[],
) {
  const next = structuredClone(result);
  next.dimensions ??= [];
  let limitReached = false;
  // The provider may put structured dimension evidence on a material; expose it
  // in the dimension inventory as well without creating another material.
  for (const item of [...next.suggestions, ...(next.sourceObservations ?? [])])
    if (
      item.drawingDimensions?.length &&
      !next.dimensions.some(
        (d) =>
          d.documentId === item.documentId &&
          d.page === item.page &&
          JSON.stringify(d.drawingDimensions) ===
            JSON.stringify(item.drawingDimensions),
      )
    )
      if (next.dimensions.length < 100)
        next.dimensions.push({
          ...structuredClone(item),
          description: "Written dimensions — " + item.description,
          destination: "Informational",
          itemRole: "Document observation",
          quantity: null,
          unit: "",
        });
  for (const doc of documents)
    for (const page of doc.pdfText?.pages ?? []) {
      if (page.status !== "Available") continue;
      const aggregate = {
        text: page.text,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        angle: 0,
      };
      const runs = [...(page.positions ?? []), aggregate];
      for (const run of runs)
        for (const m of drawingMeasurements({
          documentId: doc.id,
          page: page.page,
          confidence: "Medium",
          sourceFacts: [run.text],
        })) {
          if (next.dimensions.length >= 100) {
            limitReached = true;
            break;
          }
          if (
            next.dimensions.some(
              (d) =>
                d.documentId === doc.id &&
                d.page === page.page &&
                ((d.drawingDimensions ?? []).some(
                  (f) =>
                    f.written.trim() === m.written.trim() &&
                    (!run.width ||
                      JSON.stringify(f.region) ===
                        JSON.stringify({
                          x: run.x,
                          y: run.y,
                          width: run.width,
                          height: run.height,
                        })),
                ) ||
                  (!run.width && (d.sourceFacts ?? []).includes(m.written))),
            )
          )
            continue;
          const writtenUnit = /ft\b|feet\b|['′]/i.test(m.written)
            ? "ft"
            : /mm\b/i.test(m.written)
              ? "mm"
              : "in";
          const writtenValue =
            m.inches *
            (writtenUnit === "ft" ? 1 / 12 : writtenUnit === "mm" ? 25.4 : 1);
          const dimension: AnalysisSuggestion = {
            description: "Selectable written dimension",
            documentId: doc.id,
            page: page.page,
            quantity: writtenValue,
            unit: writtenUnit,
            notes:
              "Detected in selectable PDF text; physical assembly association not established",
            confidence: "Medium",
            destination: "Informational",
            classification: "Plan fact",
            category: "Miscellaneous",
            itemRole: "Document observation",
            quantityMethod: "Written",
            sourceFacts: [m.written],
            assumptions: [],
            warnings: [],
            drawingDimensions: [
              {
                written: m.written,
                value: writtenValue,
                unit: writtenUnit,
                role: "Other",
                field: "",
                assemblyRef: "",
                beamLabel: "",
                association: "Uncertain",
                readable: true,
                evidence: m.fact.slice(0, 1000),
                orientation: run.angle,
                region: {
                  x: run.x,
                  y: run.y,
                  width: run.width,
                  height: run.height,
                },
                start: null,
                end: null,
              },
            ],
          };
          next.dimensions.push(dimension);
        }
    }
  if (limitReached)
    next.warnings = [
      ...new Set([
        ...next.warnings,
        "Dimension inventory reached its 100-record limit. Original PDF is preserved; inspect additional drawing dimensions before approval.",
      ]),
    ];
  if (!next.dimensions.length)
    next.warnings = [
      ...new Set([
        ...next.warnings,
        "No readable dimension records were returned or recoverable from selectable text. Drawing geometry cannot be calculated from specifications alone; inspect original plan/drawing legibility.",
      ]),
    ];
  return next;
}
