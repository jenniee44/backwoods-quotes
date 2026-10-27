import { id, type Quote, type TakeoffItem } from "./model";
import { editTakeoff } from "./planAnalysis";
export const scopeChoices = [
  "Helical piles — subcontractor",
  "Decking",
  "Railings / guards",
  "Stairs",
  "Demolition",
] as const;
export type ScopeChoice = (typeof scopeChoices)[number];
/** Contractor inputs, never engineering substitutions or AI drawing facts. */
export function addContractorScope(
  q: Quote,
  choice: ScopeChoice,
  description: string,
  specification: string,
  quantity: number | null,
  unit: string,
  replaces: string[],
  acknowledged: boolean,
): Quote {
  if (q.status !== "Draft" || !acknowledged)
    throw new Error(
      "Confirm this is your project scope decision before adding it.",
    );
  if (
    !scopeChoices.includes(choice) ||
    !description.trim() ||
    !unit.trim() ||
    unit.length > 40 ||
    description.length > 500 ||
    specification.length > 1000 ||
    (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0))
  )
    throw new Error(
      "Enter a description, unit and positive quantity, or leave the quantity blank.",
    );
  if (
    new Set(replaces).size !== replaces.length ||
    replaces.some((key) => !q.takeoff.some((t) => t.id === key))
  )
    throw new Error("The replacement selection changed. Review it again.");
  if (replaces.length && choice !== "Helical piles — subcontractor")
    throw new Error(
      "Only the foundation decision may replace footing observations here.",
    );
  const original = q.takeoff.filter((t) => replaces.includes(t.id));
  if (
    original.some(
      (t) =>
        t.convertedLineId ||
        t.status === "Approved" ||
        !/footing|pier|foundation|concrete/i.test(t.description),
    )
  )
    throw new Error(
      "Only unapproved footing observations can be excluded here. Review existing approved or priced work separately.",
    );
  if (
    q.takeoff.some(
      (t) =>
        t.status !== "Rejected" &&
        t.notes.startsWith(`Contractor project scope decision: ${choice}.`),
    )
  )
    throw new Error(
      "This scope decision already exists. Edit the existing entry instead.",
    );
  const item: TakeoffItem = {
    id: id(),
    documentId: "",
    page: null,
    description: description.trim(),
    specification: specification.trim(),
    quantity,
    unit: unit.trim(),
    status: "Proposed",
    confidence: "Unspecified",
    destination:
      choice === "Helical piles — subcontractor"
        ? "Subcontractor"
        : choice === "Demolition"
          ? "Other Costs"
          : "Materials",
    category:
      choice === "Helical piles — subcontractor"
        ? "Other Subcontractor"
        : choice === "Decking"
          ? "Decking"
          : choice === "Demolition"
            ? "Miscellaneous"
            : choice === "Stairs"
              ? "Stairs"
              : "Railings / Guards",
    workScope:
      choice === "Demolition"
        ? "Existing work to remove or modify"
        : "New work",
    included: true,
    scopeVerified: true,
    classification: "Estimating suggestion",
    quantityMethod: "Unknown",
    notes: `Contractor project scope decision: ${choice}. Not a drawing or engineering requirement. ${replaces.length ? "Replaces selected drawing observations for this quote only." : "Additional included work."}`,
    sourceFacts: original
      .map(
        (t) =>
          `Original drawing requirement retained in takeoff ${t.id}, page ${t.page ?? "unknown"}: ${t.description}`,
      )
      .slice(0, 20),
    warnings:
      choice === "Helical piles — subcontractor"
        ? [
            "Contractor must confirm engineering/permit acceptance and subcontractor scope. No structural equivalence is assumed.",
          ]
        : [],
  };
  return {
    ...q,
    takeoff: [
      ...q.takeoff.map((t) =>
        replaces.includes(t.id)
          ? {
              ...editTakeoff(t, { included: false }),
              status: "Rejected" as const,
            }
          : t,
      ),
      item,
    ],
  };
}
