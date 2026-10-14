import type { Quote } from "./model";
import { readyForEstimate } from "./takeoffReview";
import { beamStockGroups } from "../shared/beamLumber";
export default function BeamShoppingList({ quote: q }: { quote: Quote }) {
  const groups = new Map<string, { description: string; quantity: number }>();
  for (const t of q.takeoff)
    if (
      t.status === "Approved" &&
      !t.convertedLineId &&
      t.calculation?.kind === "beam-runs" &&
      readyForEstimate(q, t)
    )
      for (const g of beamStockGroups(t.calculation, t.specification ?? "")) {
        const description = `${g.specification} × ${g.stock} ft`,
          key = description.toLowerCase().replace(/[×✕]/g, "x");
        const prior = groups.get(key);
        if (prior) prior.quantity += g.quantity;
        else groups.set(key, { description, quantity: g.quantity });
      }
  if (!groups.size) return null;
  return (
    <section aria-label="Approved beam lumber">
      <h4>Beam lumber to purchase</h4>
      {[...groups.values()].map((g) => (
        <p key={g.description}>
          {g.description} — {g.quantity} boards
        </p>
      ))}
      <small>
        Only approved, distinct assemblies are included. Waste was rounded per
        stock group in each approved calculation.
      </small>
    </section>
  );
}
