import { isBeamMaterial } from "./beamMaterial";
import type { TakeoffItem } from "./model";
export function relevantCalculators(item: TakeoffItem) {
  const identity = `${item.description} ${item.specification ?? ""}`;
  if (/flashing|waterproof/i.test(identity)) return ["railing"];
  if (
    /ledger/i.test(identity) &&
    !/hanger|connector|fastener|screw|bolt/i.test(item.description)
  )
    return ["ledger"];
  if (isBeamMaterial(item)) return ["beam-runs", "beams"];
  const specific = matchingCalculators(item.description);
  return specific.length ? specific : matchingCalculators(item.category ?? "");
}
function matchingCalculators(text: string) {
  if (/flashing|waterproof/i.test(text)) return ["railing"];
  if (/hanger|fastener|screw|bolt|connector/i.test(text)) return ["hardware"];
  if (/beam/i.test(text)) return ["beam-runs", "beams"];
  if (/rim|band joist/i.test(text)) return ["rim-joist"];
  if (/joist/i.test(text)) return ["joists"];
  if (/deck(?:ing)? boards?|decking/i.test(text))
    return ["decking-layout", "decking", "area"];
  if (/footing|concrete|foundation/i.test(text))
    return ["concrete", "rectangular-concrete", "posts"];
  if (/post/i.test(text)) return ["post-stock", "posts"];
  if (/ledger/i.test(text)) return ["ledger"];
  if (/blocking/i.test(text)) return ["blocking"];
  if (/fascia/i.test(text)) return ["fascia"];
  if (/railing|guard|trim/i.test(text)) return ["railing"];
  if (/drywall|sheathing|sheet/i.test(text)) return ["sheets"];
  if (/flooring/i.test(text)) return ["coverage", "area"];
  if (/stud/i.test(text)) return ["studs"];
  if (/tread/i.test(text)) return ["treads"];
  if (/stringer/i.test(text)) return ["stringers"];
  return [];
}
