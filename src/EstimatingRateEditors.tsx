import { useState } from "react";
import { money } from "./model";
import {
  calculateCrewEstimate,
  validMaterialCatalogue,
} from "./estimatingRates";
import type {
  CrewEstimateInputs,
  MaterialCatalogueEntry,
} from "./estimatingRates";

const emptyMaterial = {
  name: "",
  unit: "",
  unitCost: "",
  stockLengthFt: "",
  supplier: "",
  sku: "",
};

export function MaterialCatalogueEditor({
  entries,
  onSave,
}: {
  entries: MaterialCatalogueEntry[];
  onSave: (entries: MaterialCatalogueEntry[]) => Promise<boolean>;
}) {
  const [id, setId] = useState("");
  const [draft, setDraft] = useState(emptyMaterial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <details className="panel settings-panel">
      <summary>Material price catalogue</summary>
      <p className="muted">
        Copy a saved unit price to a matching draft material line when you need
        it.
      </p>
      <label className="field">
        Edit catalogue entry
        <select
          value={id}
          disabled={saving}
          onChange={(event) => {
            const entry = entries.find(
              (item) => item.id === event.target.value,
            );
            setId(entry?.id ?? "");
            setDraft(
              entry
                ? {
                    ...entry,
                    unitCost: String(entry.unitCost),
                    stockLengthFt: String(entry.stockLengthFt ?? ""),
                  }
                : emptyMaterial,
            );
            setError("");
          }}
        >
          <option value="">New entry</option>
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const entry: MaterialCatalogueEntry = {
            id: id || crypto.randomUUID(),
            name: draft.name.trim(),
            unit: draft.unit.trim(),
            unitCost: Number(draft.unitCost),
            supplier: draft.supplier.trim(),
            sku: draft.sku.trim(),
            stockLengthFt:
              draft.stockLengthFt === ""
                ? undefined
                : Number(draft.stockLengthFt),
          };
          const next = id
            ? entries.map((item) => (item.id === id ? entry : item))
            : [...entries, entry];
          if (!draft.unitCost.trim() || !validMaterialCatalogue(next)) {
            setError(
              "Enter a material name, unit, valid cost and optional stock length.",
            );
            return;
          }
          setSaving(true);
          try {
            if (await onSave(next)) {
              setId(entry.id);
              setError("");
            }
          } finally {
            setSaving(false);
          }
        }}
      >
        <fieldset className="fields compact" disabled={saving}>
          {(
            [
              ["name", "Material name"],
              ["unit", "Catalogue unit"],
              ["unitCost", "Catalogue unit cost ($)"],
              ["stockLengthFt", "Stock length (ft, optional)"],
              ["supplier", "Catalogue supplier"],
              ["sku", "Catalogue SKU"],
            ] as const
          ).map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                type={
                  key === "unitCost" || key === "stockLengthFt"
                    ? "number"
                    : "text"
                }
                min="0"
                step="any"
                value={draft[key]}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </label>
          ))}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button className="button secondary" disabled={saving}>
          Save catalogue entry
        </button>
      </form>
    </details>
  );
}

const crewFields: [keyof CrewEstimateInputs, string][] = [
  ["quantity", "Task quantity"],
  ["unitsPerCrewHour", "Units per crew-hour at full efficiency"],
  ["crewMembers", "Crew members"],
  ["efficiencyPercent", "Crew efficiency (%)"],
  ["wagePerHour", "Wage per worker-hour ($)"],
  ["burdenPercent", "Employee burden (%)"],
  ["equipmentPerCrewHour", "Equipment per crew-hour ($)"],
];

export function CrewEstimateEditor({
  onApply,
  onAddEquipment,
  equipmentExists,
}: {
  equipmentExists: boolean;
  onApply: (hours: number, hourlyCost: number) => void;
  onAddEquipment: (hours: number, hourlyCost: number) => void;
}) {
  const [draft, setDraft] = useState<
    Partial<Record<keyof CrewEstimateInputs, string>>
  >({});
  const [equipmentAdded, setEquipmentAdded] = useState(false);
  const [open, setOpen] = useState(false);
  const result = calculateCrewEstimate({
    quantity: Number(draft.quantity),
    unitsPerCrewHour: Number(draft.unitsPerCrewHour),
    crewMembers: Number(draft.crewMembers),
    efficiencyPercent: Number(draft.efficiencyPercent),
    wagePerHour: Number(draft.wagePerHour || Number.NaN),
    burdenPercent: Number(draft.burdenPercent ?? 0),
    equipmentPerCrewHour: Number(draft.equipmentPerCrewHour ?? 0),
  });
  const equipmentRate = Number(draft.equipmentPerCrewHour ?? 0);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Estimate labour from task productivity</summary>
      {open && (
        <>
          <div className="fields compact">
            {crewFields.map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="number"
                  min="0"
                  step={key === "crewMembers" ? "1" : "any"}
                  max={key === "efficiencyPercent" ? "100" : undefined}
                  value={draft[key] ?? ""}
                  onChange={(event) => {
                    setDraft({ ...draft, [key]: event.target.value });
                    setEquipmentAdded(false);
                  }}
                />
              </label>
            ))}
          </div>
          {result && (
            <>
              <p>
                {result.labourHours.toLocaleString("en-CA", {
                  maximumFractionDigits: 2,
                })}{" "}
                worker-hours · {money(result.labourCost)} labour ·{" "}
                {money(result.equipmentCost)} equipment
              </p>
              <button
                className="button secondary"
                type="button"
                onClick={() => onApply(result.labourHours, result.burdenedWage)}
              >
                Use labour hours and cost
              </button>
              {equipmentRate > 0 && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={equipmentAdded}
                  onClick={() => {
                    onAddEquipment(result.crewHours, equipmentRate);
                    setEquipmentAdded(true);
                  }}
                >
                  {equipmentExists
                    ? "Update separate equipment line"
                    : "Add separate equipment line"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </details>
  );
}
