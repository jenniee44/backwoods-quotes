type Identity = {
  description: string;
  specification?: string;
  beamAssemblies?: { specification: string }[];
};
const families: [string, RegExp][] = [
  [
    "hardware",
    /\b(?:hangers?|connectors?|fasteners?|screws?|bolts?|saddles?|caps?|bases?|LUS\d+)\b/i,
  ],
  ["piles", /\b(?:helical|piles?)\b/i],
  ["footings", /\b(?:footings?|piers?|concrete foundations?)\b/i],
  ["railings", /\b(?:guards?|railings?|handrails?)\b/i],
  ["stairs", /\b(?:stairs?|treads?|stringers?|risers?)\b/i],
  ["decking", /\b(?:decking|deck boards?)\b/i],
  ["ledger", /\b(?:ledger|flashing)\b/i],
  ["beams", /\b(?:beams?|girders?)\b/i],
  ["posts", /\bposts?\b/i],
  ["joists", /\bjoists?\b/i],
];
export function explicitBeamIdentity(item: Identity) {
  const description = item.description;
  if (
    /ledger|flashing|rim joist|band joist|hanger|connector|screw|bolt|fastener|post|guard|railing|stair|decking|deck boards|footing|pier|blocking|fascia/i.test(
      description,
    )
  )
    return false;
  const specification = item.specification ?? "";
  if (/ledger|flashing|rim joist|band joist/i.test(specification)) return false;
  if (
    /joist/i.test(description) &&
    !item.beamAssemblies?.length &&
    !/\b(?:beam|girder)\b/i.test(specification)
  )
    return false;
  return (
    /\b(?:beam|girder)\b/i.test(specification) ||
    !!item.beamAssemblies?.some((b) =>
      /\d+\s*[- ]?ply\b/i.test(b.specification),
    ) ||
    // A standalone built-up lumber callout is not a joist spacing note. Do not
    // reinterpret explicitly identified trimmers, rims, headers or posts.
    (/^\s*\d+\s*[- ]?ply\s+\d+\s*[x×]\s*\d+\s*(?:PT|pressure[- ]treated)?\s*$/i.test(
      specification,
    ) &&
      !/rim|band|trimmer|header|post|blocking|double joist|triple joist/i.test(
        description,
      ))
  );
}
export function componentSubject(item: Identity) {
  if (explicitBeamIdentity(item)) return "beams";
  return families.find(([, pattern]) => pattern.test(item.description))?.[0];
}
/** A scope qualifier belongs to its nearest named component, not every material
 * sharing a detail. Ambiguous associations stay unresolved, never silently new. */
export function scopeClauseApplies(
  item: Identity,
  clause: string,
  marker: RegExp,
) {
  const match = marker.exec(clause);
  if (!match) return false;
  const subject = componentSubject(item);
  if (!subject) return true; // Legacy generic rows keep conservative scope behavior.
  const prefix = clause.slice(0, match.index);
  const mentions = families.flatMap(([family, pattern]) =>
    [...prefix.matchAll(new RegExp(pattern.source, "gi"))].map((m) => ({
      family,
      index: m.index!,
    })),
  );
  mentions.sort((a, b) => b.index - a.index);
  if (mentions.length && mentions[0].family !== subject) return false;
  if (
    /\b(?:steel|W\d+)\b/i.test(clause) &&
    /\b(?:PT|pressure[- ]treated|wood|timber)\b/i.test(item.specification ?? "")
  )
    return false;
  const label = item.description.match(/\bbeam\s+([A-Z]-?\d+)\b/i)?.[1];
  const other = clause.match(/\bbeam\s+([A-Z]-?\d+)\b/i)?.[1];
  if (label && other && label.toLowerCase() !== other.toLowerCase())
    return false;
  return true;
}
