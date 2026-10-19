import { spatialBeamIdentity } from "../shared/spatialBeams";
import type { TakeoffItem } from "./model";
import { normalizeSpecification } from "../shared/componentIdentity";
const sorted = (v: Record<string, unknown> | undefined) =>
  Object.entries(v ?? {}).sort(([a], [b]) => a.localeCompare(b));
export function sameBeamCalculator(a: TakeoffItem, b: TakeoffItem) {
  if (
    !(a.category === "Beams" || /beam/i.test(a.description)) ||
    !(b.category === "Beams" || /beam/i.test(b.description))
  )
    return false;
  const value = (t: TakeoffItem) => ({
    spatial: spatialBeamIdentity(t.beamAssemblies),
    kind: t.calculation?.kind,
    inputs: sorted(t.calculation?.inputs),
    specs: sorted(
      Object.fromEntries(
        Object.entries(t.calculation?.specifications ?? {}).map(([k, v]) => [
          k,
          normalizeSpecification(v),
        ]),
      ),
    ),
    arrangements: sorted(t.calculation?.arrangements),
    stock: t.calculation?.availableStock,
    labels: sorted(
      Object.fromEntries(
        Object.entries(t.calculation?.runLabels ?? {}).map(([k, v]) => [
          k,
          v
            .toUpperCase()
            .replace(/^BEAM\s*(?:RUN\s*)?/, "")
            .replace(/[\s-]+/g, ""),
        ]),
      ),
    ),
    verified: t.calculation?.verified ?? false,
  });
  return JSON.stringify(value(a)) === JSON.stringify(value(b));
}
