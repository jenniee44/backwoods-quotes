import { editTakeoff } from "./planAnalysis";
import type { TakeoffItem } from "./model";
import { includedScope, workScope } from "./takeoffScope";
import { requiresScopeVerification } from "../shared/takeoff";
import { calculateMaterial, calculators } from "../shared/materialCalculators";
export type QuickMaterialDraft = {
  description: string;
  specification: string;
  quantity: number | null;
  unit: string;
  stockLength: number | null;
  included: boolean;
  scope: NonNullable<TakeoffItem["workScope"]>;
  scopeVerified: boolean;
  scopeAcknowledged?: boolean;
};
export function needsStockLength(t: TakeoffItem) {
  if ((t.destination ?? "Materials") !== "Materials") return false;
  if (
    calculators
      .find((c) => c.kind === t.calculation?.kind)
      ?.fields.some((f) => f.key === "stock")
  )
    return true;
  if (
    /flashing|waterproof|fastener|screws?|bolts?|hangers?|connectors?|brackets?|post (?:base|cap)/i.test(
      t.description,
    )
  )
    return false;
  return /\b(?:boards?|joists?|beams?|posts?|ledger|lumber|stringers?)\b|decking/i.test(
    t.description,
  );
}
export function materialStockLength(t: TakeoffItem) {
  return t.calculation &&
    calculators
      .find((c) => c.kind === t.calculation?.kind)
      ?.fields.some((f) => f.key === "stock")
    ? (t.calculation.inputs.stock ?? null)
    : (t.stockLength ?? null);
}
export function quickMaterialDraft(t: TakeoffItem): QuickMaterialDraft {
  return {
    description: t.description,
    specification: t.specification ?? "",
    quantity: t.quantity,
    unit: t.unit,
    stockLength: materialStockLength(t),
    included: t.status !== "Rejected" && includedScope(t),
    scope: workScope(t),
    scopeVerified: !!t.scopeVerified,
  };
}
export function quickMaterialChanges(
  t: TakeoffItem,
  d: QuickMaterialDraft,
): Partial<TakeoffItem> {
  if (d.quantity !== null && (!Number.isFinite(d.quantity) || d.quantity < 0))
    throw new Error(
      "Enter a non-negative verified quantity, or leave it blank.",
    );
  if (
    d.stockLength !== null &&
    (!Number.isFinite(d.stockLength) || d.stockLength <= 0)
  )
    throw new Error("Enter a positive stock length, or leave it blank.");
  if (
    d.included &&
    ["Existing work to remain", "Requires scope confirmation"].includes(d.scope)
  )
    throw new Error(
      "Confirm the work scope before including it. Existing-to-remain work stays excluded.",
    );
  const delta: Partial<TakeoffItem> = {};
  if (d.description !== t.description) delta.description = d.description;
  if (d.specification !== (t.specification ?? ""))
    delta.specification = d.specification;
  const manualQuantity = d.quantity !== t.quantity || d.unit !== t.unit;
  if (manualQuantity)
    Object.assign(delta, {
      quantity: d.quantity,
      unit: d.unit,
      calculation: undefined,
      quantityMethod: "Unknown",
      calculationBasis:
        "Manual estimate quantity entered by contractor; requires review",
      classification:
        d.quantity === null
          ? "Contractor input required"
          : "Estimating suggestion",
    });
  const originalStock = materialStockLength(t);
  if (d.stockLength !== originalStock) {
    delta.stockLength = d.stockLength;
    if (
      t.calculation &&
      !manualQuantity &&
      calculators
        .find((c) => c.kind === t.calculation?.kind)
        ?.fields.some((f) => f.key === "stock")
    ) {
      const calculation = {
        ...t.calculation,
        verified: false,
        inputs: { ...t.calculation.inputs, stock: d.stockLength },
      };
      const result = calculateMaterial(calculation);
      Object.assign(delta, {
        calculation,
        quantity: result.quantity,
        unit: result.unit || t.unit,
        quantityMethod: "Unknown",
        classification: "Contractor input required",
        calculationBasis:
          "Stock length changed; recalculate and verify inputs. Previous calculation retained in notes.",
      });
    }
  }
  if (
    (manualQuantity || d.stockLength !== originalStock) &&
    (t.calculationBasis || t.calculation)
  ) {
    const previous = `Previous calculation (not current verification): ${t.calculationBasis ?? ""}; ${t.calculation ? JSON.stringify(t.calculation) : ""}`;
    delta.notes = [t.notes, previous].filter(Boolean).join("\n");
  }
  if (d.scope !== workScope(t))
    Object.assign(delta, { workScope: d.scope, scopeVerified: false });
  if (
    d.included !== includedScope(t) ||
    (t.status === "Rejected" && d.included)
  )
    delta.included = d.included;
  if (
    d.scopeAcknowledged ||
    d.scopeVerified !== !!t.scopeVerified ||
    d.scope !== workScope(t)
  )
    delta.scopeVerified = d.scopeVerified;
  const candidate = { ...t, ...delta };
  if (
    d.included &&
    (requiresScopeVerification(candidate) || d.scope !== "New work") &&
    !d.scopeVerified
  )
    throw new Error(
      "Verify that this work is included in your contract before saving Yes.",
    );
  return delta;
}

export function applyQuickMaterialChanges(
  t: TakeoffItem,
  delta: Partial<TakeoffItem>,
) {
  const next = editTakeoff(t, delta);
  return {
    ...next,
    ...(delta.scopeVerified === true ? { scopeVerified: true } : {}),
  };
}
