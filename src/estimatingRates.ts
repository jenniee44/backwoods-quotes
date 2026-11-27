import type { Line } from "./model";

export type MaterialCatalogueEntry = {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
  stockLengthFt?: number;
  supplier: string;
  sku: string;
};

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

function isMaterialEntry(value: unknown): value is MaterialCatalogueEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<MaterialCatalogueEntry>;
  return (
    typeof entry.id === "string" &&
    !!entry.id.trim() &&
    typeof entry.name === "string" &&
    !!entry.name.trim() &&
    typeof entry.unit === "string" &&
    !!entry.unit.trim() &&
    typeof entry.supplier === "string" &&
    typeof entry.sku === "string" &&
    finiteNonNegative(entry.unitCost) &&
    (entry.stockLengthFt === undefined ||
      (finiteNonNegative(entry.stockLengthFt) && entry.stockLengthFt > 0))
  );
}

export function validMaterialCatalogue(
  value: unknown,
): value is MaterialCatalogueEntry[] {
  return (
    Array.isArray(value) &&
    value.every(isMaterialEntry) &&
    new Set(value.map((entry) => entry.id)).size === value.length
  );
}

export function matchingMaterialUnit(
  line: Line,
  entry: MaterialCatalogueEntry,
): boolean {
  return (
    line.kind === "Materials" &&
    line.unit.trim().toLowerCase() === entry.unit.trim().toLowerCase()
  );
}

export function copyCataloguePrice(
  line: Line,
  entry: MaterialCatalogueEntry,
): Line {
  if (!matchingMaterialUnit(line, entry))
    throw new Error("Catalogue and quote units must match.");
  return {
    ...line,
    cost: entry.unitCost,
    supplier: entry.supplier,
    sku: entry.sku,
    catalogueStockLengthFt: entry.stockLengthFt,
    pricingRequired: entry.unitCost === 0,
  };
}

export type CrewEstimateInputs = {
  quantity: number;
  unitsPerCrewHour: number;
  crewMembers: number;
  efficiencyPercent: number;
  wagePerHour: number;
  burdenPercent: number;
  equipmentPerCrewHour: number;
};

export function calculateCrewEstimate(inputs: CrewEstimateInputs) {
  const {
    quantity,
    unitsPerCrewHour,
    crewMembers,
    efficiencyPercent,
    wagePerHour,
    burdenPercent,
    equipmentPerCrewHour,
  } = inputs;
  if (
    !Object.values(inputs).every(finiteNonNegative) ||
    quantity <= 0 ||
    unitsPerCrewHour <= 0 ||
    !Number.isSafeInteger(crewMembers) ||
    crewMembers < 1 ||
    efficiencyPercent <= 0 ||
    efficiencyPercent > 100
  )
    return null;

  const crewHours = quantity / ((unitsPerCrewHour * efficiencyPercent) / 100);
  const labourHours = crewHours * crewMembers;
  const burdenedWage = wagePerHour * (1 + burdenPercent / 100);
  const equipmentCost = crewHours * equipmentPerCrewHour;
  const labourCost = labourHours * burdenedWage;
  if (
    ![crewHours, labourHours, burdenedWage, equipmentCost, labourCost].every(
      Number.isFinite,
    )
  )
    return null;
  return { crewHours, labourHours, burdenedWage, equipmentCost, labourCost };
}
