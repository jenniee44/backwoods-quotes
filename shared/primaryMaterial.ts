/** Relational context identifies another component, not the primary material.
 * Original descriptions/evidence stay stored; this is for classification only. */
export function primaryMaterialDescription(description: string) {
  return description
    .split(
      /\b(?:with|c\s*\/\s*w|secured|attached|supported|connected|into|at|for)\b/i,
    )[0]
    .trim();
}
export function detailOnlyBeamEvidence(item: {
  description: string;
  location?: string;
  beamAssemblies?: { evidence: string }[];
}) {
  if (
    !/\bbeam|girder\b/i.test(primaryMaterialDescription(item.description)) &&
    !item.beamAssemblies?.length
  )
    return false;
  const view = [item.description, item.location].join(" ");
  return (
    /connection detail|hanger detail|beam.to.joist support/i.test(view) &&
    !/framing plan|plan view|physical beam lines?|beam layout/i.test(
      [view, ...(item.beamAssemblies ?? []).map((b) => b.evidence)].join(" "),
    )
  );
}
