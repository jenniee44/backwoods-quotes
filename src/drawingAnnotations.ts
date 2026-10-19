// Semantic reading priorities only. These do not establish dimensions or counts.
export function drawingAnnotation(text: string) {
  const t = text.trim();
  const component =
    /\b(?:beams?|girders?|joists?|posts?|footings?|piers?|piles?|foundations?|ledgers?|blocking|rim|hangers?|connectors?|fasteners?|stairs?|landings?|treads?|risers?|guards?|railings?|decking|fascia)\b/i.test(
      t,
    );
  const material =
    /\b\d+\s*[- ]?(?:ply|plies)\b|\b\d+\s*[x×]\s*\d+\b|\b(?:LUS|HUS|ABU)\d+|pressure[ -]treated|hot[ -]dip|galvani[sz]ed/i.test(
      t,
    );
  const dimension = /\d\s*(?:ft\b|feet\b|in\b|inch|mm\b|cm\b|["′″'])/i.test(t);
  const instruction =
    /\b(?:spacing|diameter|depth|embed|fasten|attach|screws?|bolts?|concrete|lumber|specification|connection|corrosion|structural)\b|o\s*[./]?\s*c\b|on cent(?:er|re)/i.test(
      t,
    );
  const safety =
    /do not scale|not for construction|by others|existing.*remain|verify.*(?:site|field)|contractor.*verify/i.test(
      t,
    );
  const admin =
    /\b(?:address|postal|zip|telephone|phone|email|copyright|client|drawn by|checked by|project name|project number|drawing title|sheet number|sheet no|date|inc|ltd|llc)\b|www\.|https?:|@\w+\./i.test(
      t,
    );
  const heading =
    /\b(?:plans?|title|project|sheet|drawing|schedule|general notes)\b/i.test(
      t,
    ) &&
    !material &&
    !dimension &&
    !/spacing|diameter|depth|fasten|attach|screw|bolt|embed|o\s*[./]?\s*c\b/i.test(
      t,
    ) &&
    !safety;
  const excluded =
    admin && !material && !(component && (dimension || instruction)) && !safety;
  const action =
    /\b(?:all|shall|must|install|provide|require|required|verify|minimum|maximum|fasten|attach|spacing|embed)\b/i.test(
      t,
    );
  const meaningful =
    !excluded &&
    !heading &&
    (component || material || dimension || safety || (instruction && action));
  const topic = /beam|girder|\d+\s*[- ]?ply|plies/i.test(t)
    ? "Beam / support association"
    : /joist|framing|ledger|blocking|rim/i.test(t)
      ? "Joists / framing"
      : /footing|pier|pile|foundation|post/i.test(t)
        ? "Footings / posts"
        : /hanger|connector|connection|fastener|LUS\d/i.test(t)
          ? "Connections / callouts"
          : /stair|landing|tread|riser|guard|railing/i.test(t)
            ? "Stairs / guards"
            : dimension
              ? "Dimensions"
              : "Material / construction notes";
  return {
    topic,
    meaningful,
    anchor:
      (meaningful && !safety) ||
      (meaningful && (component || material || dimension)),
    weight: !meaningful
      ? 0
      : component || material
        ? 8
        : dimension || instruction
          ? 2
          : 1,
  };
}
