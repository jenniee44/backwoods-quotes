import type { TakeoffItem } from "./model";
/** Quote-scope projection only: original drawing records remain untouched. */
export function effectiveBeamObservations(item: TakeoffItem) {
  return (item.beamAssemblies ?? []).map((b) =>
    item.scopeOverride === "Included" &&
    item.scopeVerified &&
    item.workScope === "New work" &&
    b.scope === "By others / excluded"
      ? { ...b, scope: "New work" as const }
      : b,
  );
}
