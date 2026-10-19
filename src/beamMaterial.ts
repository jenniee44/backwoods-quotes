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
