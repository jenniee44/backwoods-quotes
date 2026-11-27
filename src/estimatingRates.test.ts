import { expect, it } from "vitest";
import {
  calculateCrewEstimate,
  copyCataloguePrice,
  validMaterialCatalogue,
} from "./estimatingRates";
import { migrate, newLine, seed } from "./model";

const entry = {
  id: "synthetic-stock",
  name: "Synthetic stock",
  unit: "each",
  unitCost: 22,
  stockLengthFt: 12,
  supplier: "Example supplier",
  sku: "TEST-1",
};

it("stores a reusable catalogue and copies a price only to matching material units", () => {
  const workspace = seed();
  const restored = migrate({ ...workspace, materialCatalogue: [entry] });
  expect(restored.materialCatalogue).toEqual([entry]);
  expect(validMaterialCatalogue([entry, entry])).toBe(false);
  expect(() =>
    migrate({ ...workspace, materialCatalogue: [{ ...entry, unitCost: -1 }] }),
  ).toThrow();
  const line = newLine("Materials", workspace.settings);
  const priced = copyCataloguePrice({ ...line, quantity: 4, waste: 10 }, entry);
  expect(priced).toMatchObject({
    quantity: 4,
    waste: 10,
    cost: 22,
    catalogueStockLengthFt: 12,
  });
  expect(
    copyCataloguePrice(line, { ...entry, unitCost: 0 }).pricingRequired,
  ).toBe(true);
  expect(line.cost).toBe(0);
  expect(() => copyCataloguePrice({ ...line, unit: "ft" }, entry)).toThrow();
});

it("costs people-hours and equipment-hours separately with explicit efficiency and burden", () => {
  const inputs = {
    quantity: 24,
    unitsPerCrewHour: 6,
    crewMembers: 2,
    efficiencyPercent: 80,
    wagePerHour: 40,
    burdenPercent: 25,
    equipmentPerCrewHour: 15,
  };
  expect(calculateCrewEstimate(inputs)).toEqual({
    crewHours: 5,
    labourHours: 10,
    burdenedWage: 50,
    equipmentCost: 75,
    labourCost: 500,
  });
  expect(calculateCrewEstimate({ ...inputs, efficiencyPercent: 0 })).toBeNull();
  expect(calculateCrewEstimate({ ...inputs, crewMembers: 1.5 })).toBeNull();
});
