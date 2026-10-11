import type { AnalysisDocument, PlanAnalysisResult } from "../shared/analysis";
import { evidenceScope } from "../shared/componentIdentity";
import { formatFeet, formatQuantity } from "../shared/measurementFormatting";
import { drawingMeasurements } from "../shared/constructionMeasurements";
const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** Deliberately narrow arithmetic from exact selectable-text facts.
 * Does not verify AI output or set approval. No stock/waste/engineering defaults.
 */
export function deriveDrawingQuantities(
  result: PlanAnalysisResult,
  documents: AnalysisDocument[],
) {
  const next = structuredClone(result);
  for (const t of next.suggestions) {
    if (
      t.quantity !== null ||
      t.destination !== "Materials" ||
      evidenceScope(t) !== "New work" ||
      !t.location?.trim()
    )
      continue;
    const page = documents
      .find((d) => d.id === t.documentId)
      ?.pdfText?.pages.find(
        (p) => p.page === t.page && p.status === "Available",
      );
    if (
      !page ||
      /conflict|uncertain|unreadable|alternative|optional/i.test(
        [t.notes, ...(t.warnings ?? [])].join(" "),
      )
    )
      continue;
    const facts = (t.sourceFacts ?? []).filter(
      (f) =>
        normalized(page.text).includes(normalized(f)) &&
        normalized(f).includes(normalized(t.location!)) &&
        !/unreadable|unknown|uncertain|approx|assum|conflict|existing|by others|not in contract/i.test(
          f,
        ),
    );
    const text = facts.join("; ");
    const values = (role: string) =>
      facts.flatMap((f) => {
        const pattern =
          "\\b" +
          role +
          "\\s*[:=]?\\s*(\\d+(?:\\.\\d+|(?:[ -]\\d+)?\\/\\d+)?\\s*(?:ft\\b|feet\\b|['′])(?:\\s*-?\\s*\\d+(?:[ -]\\d+\\/\\d+|\\/\\d+)?\\s*(?:in\\b|inches\\b|[\"″]))?)";
        const matches = [...f.matchAll(new RegExp(pattern, "gi"))];
        return matches.flatMap((m) =>
          drawingMeasurements({
            ...t,
            documentId: t.documentId,
            page: t.page,
            confidence: t.confidence,
            sourceFacts: [m[1]],
          }).map((v) => v.inches),
        );
      });
    const unique = (v: number[]) => [...new Set(v)];
    const lengths = unique(values("length")),
      widths = unique(values("width"));
    if (
      /rectangular/i.test(text) &&
      /^(?:sq ft|sq\. ft|square feet|ft2)$/i.test(t.unit) &&
      lengths.length === 1 &&
      widths.length === 1
    ) {
      const area = (lengths[0] * widths[0]) / 144;
      if (!Number.isFinite(area) || area <= 0) continue;
      t.quantity = area;
      t.classification = "Calculated quantity";
      t.quantityMethod = "Calculated";
      t.confidence = "Medium";
      t.calculationBasis =
        "Rectangular area = written length × written width: " +
        formatFeet(lengths[0] / 12) +
        " × " +
        formatFeet(widths[0] / 12) +
        " = " +
        formatQuantity(t.quantity, "sq ft") +
        ". Area only; no purchase boards, stock lengths or waste inferred.";
      t.warnings = [
        ...new Set([
          ...(t.warnings ?? []),
          "Calculated from matching selectable drawing text; contractor must verify geometry and inputs before approval.",
        ]),
      ];
    }
  }
  return next;
}
