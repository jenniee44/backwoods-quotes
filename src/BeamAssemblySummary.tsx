import type { TakeoffItem } from "./model";
import {
  beamGeometryProblem,
  pointToBeam,
  uniqueSpatialBeams,
} from "../shared/spatialBeams";
import {
  spatialBeamLength,
  spatialBeamReviewProblem,
} from "./spatialBeamPrefill";
import { formatFeet } from "../shared/measurementFormatting";
export default function BeamAssemblySummary({ item }: { item: TakeoffItem }) {
  if (!item.beamAssemblies?.length) return null;
  const groups = uniqueSpatialBeams(item.beamAssemblies);
  const proposed = groups.filter(
    (g) =>
      g[0].scope === "New work" || g[0].scope === "Requires scope confirmation",
  );
  return (
    <section
      aria-label="Proposed physical beam lines"
      className="beam-assembly-summary"
    >
      <strong>
        {proposed.length} proposed beam{" "}
        {proposed.length === 1 ? "line" : "lines"} — verify against drawing
      </strong>
      <p className="tiny">
        Repeated labels are references, not additional beams. Runs, spans, plies
        and purchasing boards are different quantities.
      </p>
      {!item.scopeVerified &&
        groups.some((g) => g[0].scope === "Requires scope confirmation") && (
          <p className="takeoff-next-step">
            Confirm which beam lines are included in this work. Uncertain scope
            is not a purchasing quantity.
          </p>
        )}
      {!!spatialBeamReviewProblem(item) && (
        <p className="takeoff-next-step">{spatialBeamReviewProblem(item)}</p>
      )}
      {groups.map((observations, index) => {
        const b = observations[0],
          n = proposed.indexOf(observations) + 1,
          proposal = spatialBeamLength(item, observations);
        const saved =
          item.calculation?.kind === "beam-runs" && n > 0
            ? item.calculation
            : undefined;
        const labelKey = (s: string) =>
          s
            .toUpperCase()
            .replace(/^BEAM\s*(?:RUN\s*)?/, "")
            .replace(/[\s-]+/g, "");
        const savedKey =
          b.drawingLabel && saved
            ? Object.keys(saved.runLabels ?? {}).find(
                (k) =>
                  labelKey(saved.runLabels![k]) === labelKey(b.drawingLabel),
              )
            : String(n);
        const length =
          saved && savedKey && Object.hasOwn(saved.inputs, `length${savedKey}`)
            ? saved.inputs[`length${savedKey}`]
            : proposal?.feet;
        const plies =
          saved && savedKey && Object.hasOwn(saved.inputs, `plies${savedKey}`)
            ? saved.inputs[`plies${savedKey}`]
            : Number(b.specification.match(/\b(\d+)\s*[- ]?ply\b/i)?.[1]);
        const problem = beamGeometryProblem(b);
        return (
          <article key={index} className="beam-line-summary">
            <strong>
              {b.drawingLabel || `Proposed beam line ${index + 1}`} —{" "}
              {b.specification || "Specification to confirm"}
            </strong>
            <p>
              {b.scope === "Requires scope confirmation" && item.scopeVerified
                ? "Included by contractor"
                : b.scope}{" "}
              ·{" "}
              {plies != null && Number.isFinite(plies) && plies > 0
                ? `${plies} plies`
                : "Plies to confirm"}{" "}
              · Length: {length != null ? formatFeet(length) : "To confirm"}
              {length != null && !saved?.verified ? " (proposed)" : ""}
            </p>
            <small>
              {item.sourceDocumentName || item.documentId} ·{" "}
              {b.sheet || "Sheet to confirm"} · page {b.page}
            </small>
            <p className="tiny">
              {b.scope === "Requires scope confirmation" && !item.scopeVerified
                ? "Confirm inclusion before approval; this line is a proposal, not a purchase quantity."
                : b.scope !== "New work" &&
                    b.scope !== "Requires scope confirmation"
                  ? "Reference only; excluded from automatic purchasing calculations."
                  : problem ||
                    (length == null
                      ? "Confirm this beam's full length; overall and support-span dimensions are not cut lengths."
                      : "Confirm stock lengths and approved cutting/splice requirements before purchasing.")}
            </p>
            <details>
              <summary>Advanced drawing evidence</summary>
              <p>
                Proposed spatial associations, not a scaled construction
                drawing. Verify on the original PDF.
              </p>
              <svg
                viewBox="0 0 100 100"
                role="img"
                aria-label={`Proposed beam evidence map ${index + 1}`}
                style={{ width: "100%", maxWidth: 320, height: 180 }}
              >
                <line
                  x1={b.start.x * 100}
                  y1={b.start.y * 100}
                  x2={b.end.x * 100}
                  y2={b.end.y * 100}
                  stroke="currentColor"
                  strokeWidth="1"
                />
                {observations
                  .flatMap((b) => b.labels)
                  .map((label, i) => (
                    <circle
                      key={`label${i}`}
                      cx={label.point.x * 100}
                      cy={label.point.y * 100}
                      r="1"
                      fill="orange"
                    >
                      <title>{label.text}</title>
                    </circle>
                  ))}
                {b.supports.map((support, i) => (
                  <circle
                    key={`support${i}`}
                    cx={support.point.x * 100}
                    cy={support.point.y * 100}
                    r="1.5"
                    fill="none"
                    stroke="currentColor"
                  >
                    <title>{support.evidence}</title>
                  </circle>
                ))}
                {b.dimensions.map((d, i) => (
                  <line
                    key={`dimension${i}`}
                    x1={d.start.x * 100}
                    y1={d.start.y * 100}
                    x2={d.end.x * 100}
                    y2={d.end.y * 100}
                    stroke="gray"
                    strokeWidth=".5"
                    strokeDasharray="2 1"
                  >
                    <title>{`${d.role}: ${d.written}`}</title>
                  </line>
                ))}
              </svg>
              {observations.map((ob, i) => (
                <section key={i}>
                  <p>
                    {ob.sheet} · page {ob.page} · {ob.confidence} confidence ·{" "}
                    {ob.evidence}
                  </p>
                  <ul>
                    {ob.labels.map((l, j) => (
                      <li key={`l${j}`}>
                        Specification reference: {l.text} (
                        {l.point.x.toFixed(3)}, {l.point.y.toFixed(3)})
                      </li>
                    ))}
                    {ob.supports.map((s, j) => (
                      <li key={`s${j}`}>
                        Support reference: {s.evidence}
                        {pointToBeam(s.point, ob) > 0.025
                          ? " — association to this beam requires confirmation"
                          : ""}
                      </li>
                    ))}
                    {ob.dimensions.map((d, j) => (
                      <li key={`d${j}`}>
                        {d.role}: {d.written} — {d.association}. {d.evidence}
                        {d.role !== "Full beam length"
                          ? " Not used as a full beam cut length."
                          : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </details>
          </article>
        );
      })}
    </section>
  );
}
