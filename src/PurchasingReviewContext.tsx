import type { Quote, TakeoffItem } from "./model";
import { purchasingGroups } from "./purchasingGroups";
import { relevantSpecifications } from "./materialReferences";
import { formatQuantity } from "../shared/measurementFormatting";
import { workScope } from "./takeoffScope";
export default function PurchasingReviewContext({
  quote: q,
  item,
  onReview,
}: {
  quote: Quote;
  item: TakeoffItem;
  onReview?: (id: string) => void;
}) {
  const group = purchasingGroups(q, q.takeoff).find((g) =>
    g.items.some((t) => t.id === item.id),
  );
  if (!group) return null;
  const refs = relevantSpecifications(q, group.items);
  return (
    <section
      className="purchasing-review-context"
      aria-label="Purchasing review details"
    >
      <h4>{group.name} — purchasing review</h4>
      <p>{group.reason}</p>
      {refs.length > 0 && (
        <section aria-label="Related drawing requirements">
          <h5>Drawing requirements — verify applicability</h5>
          {refs.map((ref) => (
            <article key={ref.id}>
              <strong>{ref.description}</strong>
              <p>{ref.specification}</p>
              <p>{ref.sourceFacts?.join("; ")}</p>
              <small>
                {ref.documentId} · Page {ref.page ?? "unknown"} ·{" "}
                {workScope(ref)}
              </small>
            </article>
          ))}
        </section>
      )}
      <details open>
        <summary>Source observations ({group.items.length})</summary>
        {group.items.map((t) => (
          <article key={t.id}>
            <strong>{t.description}</strong>
            <p>
              {t.specification} · {t.location || "Location to confirm"} ·{" "}
              {workScope(t)}
            </p>
            <p>
              Observed:{" "}
              {t.quantity === null
                ? "To confirm"
                : formatQuantity(t.quantity, t.unit)}{" "}
              — not an added purchase quantity
            </p>
            <small>
              {t.documentId || "Source unknown"} · Page {t.page ?? "unknown"} ·{" "}
              {t.alternativeOption}
            </small>
            <p>{t.sourceFacts?.join("; ")}</p>
            <p>{t.calculationBasis}</p>
            {t.warnings?.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
            {onReview && t.id !== item.id && (
              <button
                className="button secondary"
                onClick={() => onReview(t.id)}
              >
                Review this observation
              </button>
            )}
          </article>
        ))}
      </details>
    </section>
  );
}
