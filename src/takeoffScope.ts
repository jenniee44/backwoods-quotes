import type { Quote, TakeoffItem } from "./model";
export type ContractorScope = {
  workScope?: "New work" | "Existing work" | "By others";
  included?: boolean;
  alternativeGroup?: string;
  alternativeOption?: string;
};
export function workScope(
  item: TakeoffItem,
): NonNullable<ContractorScope["workScope"]> {
  return (
    item.workScope ??
    (item.supportBasis === "By others" ||
    item.subcontractorBasis === "Explicit by others"
      ? "By others"
      : item.supportBasis === "Existing work"
        ? "Existing work"
        : "New work")
  );
}
export function includedScope(item: TakeoffItem) {
  return (
    item.included !== false &&
    (workScope(item) === "New work" || item.scopeVerified === true)
  );
}
export function validScope(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const v = value as ContractorScope;
  return (
    (v.workScope === undefined ||
      ["New work", "Existing work", "By others"].includes(v.workScope)) &&
    (v.included === undefined || typeof v.included === "boolean") &&
    [v.alternativeGroup, v.alternativeOption].every(
      (s) => s === undefined || (typeof s === "string" && s.length <= 200),
    )
  );
}
export function foundationMethod(item: TakeoffItem) {
  if (/helical|screw pile/i.test(item.description)) return "Helical piles";
  if (
    /concrete.*(?:footing|pier)|(?:footing|pier).*concrete/i.test(
      item.description,
    )
  )
    return "Concrete footings";
  return undefined;
}
export function unresolvedFoundationAlternative(q: Quote, item: TakeoffItem) {
  const method = foundationMethod(item);
  if (!method) return false;
  return q.takeoff.some(
    (peer) =>
      peer.id !== item.id &&
      peer.status !== "Rejected" &&
      includedScope(peer) &&
      foundationMethod(peer) &&
      foundationMethod(peer) !== method &&
      (!peer.location?.trim() ||
        !item.location?.trim() ||
        peer.location.trim().toLowerCase() ===
          item.location.trim().toLowerCase()) &&
      (!item.alternativeGroup?.trim() || !peer.alternativeGroup?.trim()),
  );
}
export function assertScope(q: Quote, item: TakeoffItem) {
  if (!includedScope(item))
    throw new Error(
      "Existing/by-others or excluded work must be explicitly included and verified before approval/conversion.",
    );
  if (unresolvedFoundationAlternative(q, item))
    throw new Error(
      "Potential concrete-footing/helical-pile alternatives need explicit assembly groups and methods before approval. Assign separate verified assembly groups if this is intentionally mixed construction.",
    );
  if (!!item.alternativeGroup?.trim() !== !!item.alternativeOption?.trim())
    throw new Error(
      "Enter both an alternative assembly group and a method, or leave both blank.",
    );
  const group = item.alternativeGroup?.trim().toLowerCase(),
    option = item.alternativeOption?.trim().toLowerCase();
  if (!group) return;
  const other = q.takeoff.some(
    (t) =>
      t.id !== item.id &&
      (t.convertedLineId || (t.status === "Approved" && includedScope(t))) &&
      t.alternativeGroup?.trim().toLowerCase() === group &&
      t.alternativeOption?.trim().toLowerCase() !== option,
  );
  const priced = q.lines.some(
    (l) =>
      l.takeoffId !== item.id &&
      l.takeoffSource?.alternativeGroup?.trim().toLowerCase() === group &&
      l.takeoffSource?.alternativeOption?.trim().toLowerCase() !== option,
  );
  if (other || priced)
    throw new Error(
      "Mutually exclusive construction methods cannot be approved or priced together for this assembly. Reject/exclude the other method first; remove its estimate line if already converted.",
    );
}
