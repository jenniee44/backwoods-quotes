import { expect, it } from "vitest";
import {
  calculateCrewEstimate,
  changeEstimateLineUnit,
  upsertCrewEquipment,
  copyCataloguePrice,
  validMaterialCatalogue,
} from "./estimatingRates";
import { duplicate, migrate, newLine, seed } from "./model";

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

it("clears a catalogue cost when its unit changes, including older stock-length entries", () => {
  const line = newLine("Materials", seed().settings);
  const priced = copyCataloguePrice(line, entry);
  expect(changeEstimateLineUnit(priced, " EACH ").cost).toBe(22);
  expect(changeEstimateLineUnit(priced, "ft")).toMatchObject({
    unit: "ft",
    cost: 0,
    pricingRequired: true,
    supplier: undefined,
    catalogueStockLengthFt: undefined,
    cataloguePriceUnit: undefined,
  });
  expect(
    changeEstimateLineUnit({ ...priced, cataloguePriceUnit: undefined }, "ft")
      .cost,
  ).toBe(0);
  expect(changeEstimateLineUnit({ ...line, cost: 7 }, "ft").cost).toBe(7);
});

it("updates equipment on repeat use and retains the task link when duplicating a draft", () => {
  const { settings, quotes } = seed();
  const labour = newLine("Labour", settings);
  const equipment = {
    ...newLine("Other Costs", settings),
    quantity: 4,
    cost: 15,
  };
  const first = upsertCrewEquipment([labour], equipment, labour.id);
  const revised = upsertCrewEquipment(
    first,
    { ...equipment, quantity: 5 },
    labour.id,
  );
  expect(revised).toHaveLength(2);
  expect(revised[1]).toMatchObject({
    id: equipment.id,
    quantity: 5,
    equipmentForLabourId: labour.id,
  });
  expect(first[1].quantity).toBe(4);
  const copy = duplicate({ ...quotes[0], lines: revised }, quotes);
  expect(copy.lines[0].id).not.toBe(labour.id);
  expect(copy.lines[1].equipmentForLabourId).toBe(copy.lines[0].id);
});
