import type { TakeoffItem } from "./model";
export function hasReadableSpecification(t: TakeoffItem) {
  return (
    !!t.specification?.trim() &&
    !/^(?:unknown|not specified|unspecified|requires contractor input|contractor input required|tbd|tbc)\b|\b(?:unreadable|illegible|not legible|not readable)\b/i.test(
      t.specification,
    )
  );
}
export function completenessProblem(t: TakeoffItem) {
  if (
    t.itemRole === "Document observation" ||
    t.itemRole === "Supporting evidence"
  )
    return "Drawing observations are evidence, not purchasable estimate items.";
  if (
    t.origin === "ai" &&
    t.destination === "Materials" &&
    !hasReadableSpecification(t)
  )
    return "Enter a readable, verified material specification before approval.";
  if (t.warnings?.some((w) => /conflicting/i.test(w)) && !t.conflictsVerified)
    return "Reconcile conflicting observations against the source before approval.";
  return "";
}
