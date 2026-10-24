import type { TakeoffItem } from "./model";
/** Select an appropriate tool, not a beam quantity. Hardware is not its beam. */
export function isBeamMaterial(item: TakeoffItem) {
  if (
    /hanger|fastener|screw|bolt|connector|flashing|waterproof/i.test(
      item.description,
    )
  )
    return false;
  if (item.beamAssemblies?.length) return true;
  if (/beam|girder/i.test(item.description)) return true;
  if (
    /joist|post|decking|footing|pier|guard|railing|stair|blocking|fascia/i.test(
      item.description,
    )
  )
    return false;
  if (item.category === "Beams") return true;
  return (
    /\b\d+\s*[- ]?ply\b/i.test(item.specification ?? item.description) &&
    /\b\d+\s*[x×]\s*\d+\b/i.test(item.specification ?? item.description)
  );
}
/** Only fill an absent field, never a deliberately cleared specification. */
export function proposedBeamSpecification(item: TakeoffItem) {
  if (item.specification !== undefined) return item.specification;
  const values = [
    ...new Set(
      (item.beamAssemblies ?? [])
        .filter(
          (b) =>
            b.scope === "New work" || b.scope === "Requires scope confirmation",
        )
        .map((b) => b.specification.trim())
        .filter(Boolean),
    ),
  ];
  return values.length === 1 &&
    !/unknown|unreadable|to confirm/i.test(values[0])
    ? values[0]
    : undefined;
}
