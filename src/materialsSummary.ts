import type { Quote, TakeoffItem } from "./model";
import { takeoffToLine } from "./model";
import { consolidateTakeoff } from "./consolidateTakeoff";
import { approveTakeoff, reviewTakeoff } from "./planAnalysis";
import { assertScope } from "./takeoffScope";
import { readyForEstimate } from "./takeoffReview";
import { calculateMaterial } from "../shared/materialCalculators";
import { editTakeoff } from "./planAnalysis";

export function prepareMaterialsSummary(items: TakeoffItem[]) {
  return consolidateTakeoff(items, true).map((t) => {
    // Only an explicitly verified, complete recipe can produce a quantity.
    // Extracted measurements alone do not authorize engineering/purchase assumptions.
    if (
      t.status !== "Proposed" ||
      t.convertedLineId ||
      !t.calculation?.verified
    )
      return t;
    const result = calculateMaterial(t.calculation);
    if (
      result.quantity === null ||
      (t.quantity === result.quantity && t.unit === result.unit)
    )
      return t;
    return editTakeoff(t, {
      calculation: t.calculation,
      quantity: result.quantity,
      unit: result.unit,
      classification: "Calculated quantity",
      quantityMethod: "Calculated",
      calculationBasis:
        result.formula +
        "; " +
        Object.entries(t.calculation.inputs)
          .map(([k, v]) => k + "=" + v)
          .join(", "),
    });
  });
}
export function summaryApprovalProblem(q: Quote, t: TakeoffItem) {
  if (t.status === "Rejected")
    return "Explicitly include this excluded material before approval";
  if (t.convertedLineId || t.status === "Approved")
    return "Already approved or added";
  if (
    (t.destination ?? "Materials") !== "Materials" ||
    (t.itemRole && t.itemRole !== "Construction item")
  )
    return "Informational or non-material item";
  try {
    const approved = approveTakeoff(reviewTakeoff(t));
    assertScope(q, approved);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
}
export function approveSummaryMaterials(
  q: Quote,
  ids: string[],
  acknowledged: boolean,
): Quote {
  if (!acknowledged)
    throw new Error(
      "Confirm you verified the materials, quantities, specifications and drawing evidence first.",
    );
  if (!ids.length) throw new Error("Select eligible materials to approve.");
  const unique = new Set(ids);
  if (
    unique.size !== ids.length ||
    ids.some((id) => !q.takeoff.some((t) => t.id === id))
  )
    throw new Error("The material selection changed. Review it again.");
  const approved = q.takeoff.map((t) => {
    if (!unique.has(t.id)) return t;
    const problem = summaryApprovalProblem(q, t);
    if (problem) throw new Error(t.description + ": " + problem);
    return approveTakeoff(reviewTakeoff(t));
  });
  const next = { ...q, takeoff: approved };
  approved.filter((t) => unique.has(t.id)).forEach((t) => assertScope(next, t));
  return next;
}
export function sendShoppingList(q: Quote): Quote {
  const items = q.takeoff.filter(
    (t) =>
      (t.destination ?? "Materials") === "Materials" &&
      t.status === "Approved" &&
      !t.convertedLineId,
  );
  if (!items.length)
    throw new Error("No approved materials are waiting to be added.");
  let next = q;
  for (const t of items) {
    if (!readyForEstimate(next, t))
      throw new Error(
        t.description +
          ": review scope, quantity and duplicate warnings before conversion.",
      );
    next = takeoffToLine(next, t, "Materials");
  }
  return next;
}
