import type { TakeoffItem } from "./model";
import { semanticItemKey } from "../shared/takeoff";
export function consolidateTakeoff(items: TakeoffItem[]) {
  const retained: TakeoffItem[] = [];
  const seen = new Map<string, TakeoffItem>();
  for (const item of items) {
    // Reviewed/converted entries remain immutable. Different pages, assemblies,
    // quantities, recipes, specifications and scope choices are never combined.
    const key = JSON.stringify([
      semanticItemKey(item),
      item.category,
      item.workScope,
      item.included,
      item.alternativeGroup,
      item.alternativeOption,
      item.calculation,
    ]);
    const existing = seen.get(key);
    if (
      !item.description.trim() ||
      item.status !== "Proposed" ||
      item.convertedLineId ||
      !existing
    ) {
      const copy = structuredClone(item);
      retained.push(copy);
      if (item.status === "Proposed" && !item.convertedLineId)
        seen.set(key, copy);
      continue;
    }
    const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
    const facts = unique([
      ...(existing.sourceFacts ?? []),
      ...(item.sourceFacts ?? []),
      `Source: ${item.documentId || "manual"}, page ${item.page ?? "unknown"}, detail ${item.sourceDetailView ?? "original"}`,
      item.notes,
    ]);
    if (facts.length > 20 || facts.some((fact) => fact.length > 1000)) {
      retained.push(structuredClone(item));
      continue;
    }
    existing.sourceFacts = facts;
    existing.warnings = unique([
      ...(existing.warnings ?? []),
      ...(item.warnings ?? []),
    ]);
    existing.assumptions = unique([
      ...(existing.assumptions ?? []),
      ...(item.assumptions ?? []),
    ]);
    existing.notes = unique([existing.notes, item.notes]).join("; ");
    const confidence = ["Unspecified", "Low", "Medium", "High"];
    existing.confidence = confidence[
      Math.min(
        confidence.indexOf(existing.confidence),
        confidence.indexOf(item.confidence),
      )
    ] as TakeoffItem["confidence"];
  }
  return retained;
}
