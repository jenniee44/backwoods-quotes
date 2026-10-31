import type { Quote } from "./model";
export const deckScopeMarker = "Contractor-confirmed deck replacement scope";
export function hasDeckReplacementScope(q: Quote) {
  return (
    q.takeoffProjectScope === "deck-replacement" ||
    q.takeoff.some(
      (t) => t.scopeVerified && t.notes.startsWith(deckScopeMarker),
    )
  );
}
