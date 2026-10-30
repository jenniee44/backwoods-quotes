import { drawingMeasurements } from "./constructionMeasurements";
import { mergeMaterialInputs, type MaterialInput } from "./materialInputs";

type Source = {
  documentId: string;
  page: number | null;
  confidence: string;
  description: string;
  specification?: string;
  sourceFacts?: string[];
  materialInputs?: MaterialInput[];
};
// Recover explicit, role-labelled transcriptions on THIS material, including old
// saved analyses. This never searches the whole page for nearby measurements.
// Bare width/length/overall dimensions and beam counts are deliberately absent.
const lengths: [RegExp, MaterialInput["field"], "ft" | "in"][] = [
  [
    /^(?:joist )?layout (?:width|length) perpendicular to (?:the )?joists\s*[:=]\s*(.+)$/i,
    "layoutLength",
    "ft",
  ],
  [/^joist spacing axis\s*[:=]\s*(.+)$/i, "layoutLength", "ft"],
  [/^deck layout length\s*[:=]\s*(.+)$/i, "layoutLength", "ft"],
  [/^deck layout width\s*[:=]\s*(.+)$/i, "layoutWidth", "ft"],
  [
    /^(?:joist|post|blocking|fascia|rim joist|ledger) (?:cut |member )?length\s*[:=]\s*(.+)$/i,
    "memberLength",
    "ft",
  ],
  [/^stair (?:flight |clear )?width\s*[:=]\s*(.+)$/i, "layoutWidth", "ft"],
  [/^(?:joist|stringer) spacing\s*[:=]\s*(.+)$/i, "spacing", "in"],
  [
    /^(?:included )?(?:railing|guard|ledger|flashing|fascia|rim joist) (?:linear )?length\s*[:=]\s*(.+)$/i,
    "linearLength",
    "ft",
  ],
  [/^actual (?:decking )?board width\s*[:=]\s*(.+)$/i, "boardWidth", "in"],
  [/^(?:decking |board )?gap\s*[:=]\s*(.+)$/i, "gap", "in"],
  [/^(?:footing|pier) diameter\s*[:=]\s*(.+)$/i, "diameter", "in"],
  [/^(?:concrete|footing|pier) depth\s*[:=]\s*(.+)$/i, "depth", "in"],
  [/^pad length\s*[:=]\s*(.+)$/i, "padLength", "in"],
  [/^pad width\s*[:=]\s*(.+)$/i, "padWidth", "in"],
];
const counts: [RegExp, MaterialInput["field"]][] = [
  [
    /^(?:unique new included )?(?:post|footing|pier|tread|blocking|rim joist|fascia|ledger) count\s*[:=]\s*(\d+)\s*(?:each|pieces|locations|treads)?$/i,
    "count",
  ],
  [
    /^(?:identified )?connection count\s*[:=]\s*(\d+)\s*(?:connections)?$/i,
    "connections",
  ],
  [
    /^(?:hangers|fasteners|connectors) per connection\s*[:=]\s*(\d+)\s*(?:each|pieces)?$/i,
    "piecesPerConnection",
  ],
  [
    /^(?:boards per tread|pieces per row)\s*[:=]\s*(\d+)\s*(?:each|pieces|boards)?$/i,
    "pieces",
  ],
];
function relevantClause(clause: string, source: Source) {
  const identity = source.description + " " + (source.specification ?? "");
  const hardware = /hanger|connector|fastener|screw|bolt|hardware/i.test(
    identity,
  );
  if (/connection|per connection/i.test(clause)) return hardware;
  if (
    /^(?:deck layout|actual (?:decking )?board|(?:decking |board )?gap|decking direction|pieces per row)/i.test(
      clause,
    )
  )
    return /decking|deck boards|surface area/i.test(identity) && !hardware;
  if (/joists|^joist |^layout (?:width|length) perpendicular/i.test(clause))
    return /joist/i.test(identity) && !hardware && !/rim|band/i.test(identity);
  if (/^(?:stair|tread|boards per tread)/i.test(clause))
    return /stair|tread|stringer/i.test(identity) && !hardware;
  if (/^stringer/i.test(clause)) return /stringer/i.test(identity);
  const component = clause.match(
    /^(?:included |unique new included )?(post|footing|pier|concrete|pad|blocking|fascia|rim joist|ledger|flashing|railing|guard)\b/i,
  )?.[1];
  if (component) {
    if (/footing|pier|concrete|pad/i.test(component))
      return (
        /footing|pier|concrete|foundation|pad/i.test(identity) && !hardware
      );
    if (/railing|guard/i.test(component))
      return /railing|guard/i.test(identity) && !hardware;
    return (
      identity.toLowerCase().includes(component.toLowerCase()) && !hardware
    );
  }
  return false;
}
export function writtenAssemblyInputs(source: Source): MaterialInput[] {
  if (source.page === null) return source.materialInputs ?? [];
  const recovered: MaterialInput[] = [];
  for (const fact of source.sourceFacts ?? []) {
    if (
      /unreadable|illegible|uncertain|approx|assum|conflict|not confirmed|to confirm|unknown|scaled|pixel|by others|existing to remain|\bnot\s+(?!scale\b)|\bexcept\b|\bunless\b/i.test(
        fact,
      )
    )
      continue;
    for (const clause of fact.split(/[;\n]/).map((s) => s.trim())) {
      if (!relevantClause(clause, source)) continue;
      for (const [pattern, field, unit] of lengths) {
        const match = clause.match(pattern);
        if (!match) continue;
        const values = drawingMeasurements({
          ...source,
          sourceFacts: [match[1]],
        });
        if (values.length !== 1 || values[0].written.trim() !== match[1].trim())
          continue;
        recovered.push({
          field,
          value: values[0].inches / (unit === "ft" ? 12 : 1),
          unit,
          page: source.page,
          evidence: clause,
          readable: true,
        });
      }
      for (const [pattern, field] of counts) {
        const match = clause.match(pattern);
        if (!match || Number(match[1]) <= 0 || Number(match[1]) > 1_000_000)
          continue;
        // A direct connection schedule is different from a support/joist count.
        recovered.push({
          field,
          value: Number(match[1]),
          unit: "each",
          page: source.page,
          evidence: clause,
          readable: true,
        });
      }
      const shape =
        /^(?:bounded )?(?:joist|deck|stair) layout:\s*uniform(?: rectangular)?, no openings$/i.test(
          clause,
        );
      const edges =
        /^(?:joist|stair) layout:\s*both edge members included$/i.test(clause);
      if (shape || edges)
        recovered.push({
          field: shape ? "layoutClear" : "edgeIncluded",
          value: 1,
          unit: "option",
          page: source.page,
          evidence: clause,
          readable: true,
        });
      const direction = clause.match(
        /^decking direction:\s*along layout (length|width)$/i,
      );
      if (direction)
        recovered.push({
          field: "direction",
          value: direction[1].toLowerCase() === "length" ? 0 : 1,
          unit: "option",
          page: source.page,
          evidence: clause,
          readable: true,
        });
    }
  }
  const merged = mergeMaterialInputs(source.materialInputs, recovered);
  // Never discard original evidence to fit a limit. Existing conflicts stay visible.
  return merged.length <= 40 ? merged : (source.materialInputs ?? []);
}
