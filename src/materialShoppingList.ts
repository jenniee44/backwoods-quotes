import type { Quote } from "./model";
import { readyForEstimate } from "./takeoffReview";
import { materialStockLength } from "./quickMaterialEdit";
import { beamStockGroups } from "../shared/beamLumber";
import { normalizeSpecification } from "../shared/componentIdentity";
export function approvedPurchasingGroups(q: Quote) {
  const groups = new Map<
    string,
    {
      specification: string;
      stock: number | null;
      unit: string;
      quantity: number;
      sourceIds: string[];
    }
  >();
  for (const t of q.takeoff) {
    if (
      t.status !== "Approved" ||
      t.destination !== "Materials" ||
      !readyForEstimate(q, t)
    )
      continue;
    const rows =
      t.calculation?.kind === "beam-runs"
        ? beamStockGroups(t.calculation, t.specification ?? "").map((g) => ({
            ...g,
            unit: "boards",
          }))
        : [
            {
              specification: t.specification || t.description,
              stock: materialStockLength(t),
              quantity: t.quantity!,
              unit: t.unit,
            },
          ];
    for (const row of rows) {
      const key = JSON.stringify([
          normalizeSpecification(row.specification),
          row.stock,
          row.unit.toLowerCase(),
        ]),
        old = groups.get(key);
      if (old) {
        old.quantity += row.quantity;
        old.sourceIds.push(t.id);
      } else groups.set(key, { ...row, sourceIds: [t.id] });
    }
  }
  return [...groups.values()];
}
