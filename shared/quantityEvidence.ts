import type { AnalysisSuggestion } from "./analysis";
import type { MaterialInput } from "./materialInputs";
export function referenceCountInput(input: MaterialInput) {
  return (
    ["count", "connections"].includes(input.field) &&
    /(?:shown|depicted|illustrated).*\bdetail\b|single.*(?:callout|note|detail)|(?:one|1) (?:visible )?(?:note|callout|detail)(?: location)?/i.test(
      input.evidence,
    )
  );
}
export function referenceCountOnly(item: AnalysisSuggestion) {
  return /count reflects.*(?:note|callout|detail).*location|count (?:of|reflects).*(?:note|callout)s? only/i.test(
    [item.notes, ...(item.assumptions ?? [])].join(" "),
  );
}
