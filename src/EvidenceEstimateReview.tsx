import { useMemo, useState } from "react";
import type { Quote, TakeoffItem } from "./model";
import { draftEstimateFromTakeoff } from "./takeoffEstimateAdapter";
import { calculateEvidenceEstimate, type EstimateInput } from "./evidenceEstimate";

type NumericField = "quantity" | "materialUnitCost" | "labourHoursPerUnit" |
  "labourCostPerHour" | "labourSellRatePerHour" | "materialMarkupPercent" | "wastePercent" |
  "crewSize" | "workHoursPerDay" | "crewEfficiencyPercent";
const fields: { key: NumericField; label: string }[] = [
  { key: "wastePercent", label: "Waste (%)" },
  { key: "materialUnitCost", label: "Material unit cost ($)" },
  { key: "labourHoursPerUnit", label: "Labour hours per unit" },
  { key: "labourCostPerHour", label: "Internal labour cost per hour ($)" },
  { key: "labourSellRatePerHour", label: "Customer labour rate per hour ($)" },
  { key: "materialMarkupPercent", label: "Material markup (%)" },
  { key: "crewSize", label: "Crew size (people)" },
  { key: "workHoursPerDay", label: "Working hours per day" },
  { key: "crewEfficiencyPercent", label: "Crew efficiency (%)" },
];
const fmt = (n: number | null) => n === null ? "Needs review" : n.toLocaleString("en-CA", { maximumFractionDigits: 2 });
export function EvidenceEstimateReview({ quote, item, onApprove }: {
  quote: Quote;
  item: TakeoffItem;
  onApprove?: (input: EstimateInput) => void;
}) {
  const draft = useMemo(() => draftEstimateFromTakeoff(quote, item), [quote, item]);
  const [changes, setChanges] = useState<Partial<EstimateInput>>({});
  const [confirmed, setConfirmed] = useState(false);
  const input: EstimateInput = { ...draft.input, ...changes };
  const result = calculateEvidenceEstimate(input);
  const reasons = [...result.reviewReasons, ...(!draft.takeoffReady
    ? ["Original drawing takeoff has not passed scope and quantity review"] : [])];
  const ready = reasons.length === 0 && confirmed;
  return (
    <section aria-label="Evidence-based estimate review">
      <h3>Review drawing quantities and pricing</h3>
      <p>Draft only. Nothing is added to a customer quote until approved.</p>
      <p><strong>{input.description}</strong> — {input.evidence || "No drawing reference"}</p>
      <p>Drawing quantity: <strong>{fmt(input.quantity)} {input.unit}</strong>. Change this in the drawing takeoff review before approving.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        <label>Work type
          <select value={input.workType ?? "supply-install"} onChange={e => {
            setChanges(prev => ({ ...prev, workType: e.target.value as EstimateInput["workType"] }));
            setConfirmed(false);
          }}>
            <option value="supply-install">Supply and install</option>
            <option value="material-only">Material only</option>
            <option value="labour-only">Labour only</option>
            <option value="subcontract">Subcontracted work</option>
          </select>
        </label>
        {fields.filter(({key}) => {
          const type = input.workType ?? "supply-install";
          const materialField = ["wastePercent", "materialUnitCost", "materialMarkupPercent"].includes(key);
          if (type === "labour-only") return !materialField;
          if (type === "material-only" || type === "subcontract") return materialField && !(type === "subcontract" && key === "wastePercent");
          return true;
        }).map(({ key, label }) => (
          <label key={key}>{input.workType === "subcontract" && key === "materialUnitCost" ? "Subcontractor unit cost ($)" : input.workType === "subcontract" && key === "materialMarkupPercent" ? "Subcontractor markup (%)" : label}
            <input type="number" min="0" step="any" value={input[key] ?? ""}
              onChange={e => {
                const value = e.target.value === "" ? null : Number(e.target.value);
                setChanges(prev => ({ ...prev, [key]: value }));
                setConfirmed(false);
              }} />
          </label>
        ))}
      </div>
      <p>Purchase quantity: {fmt(result.purchaseQuantity)} {input.unit}</p>
      <p>Material cost: ${fmt(result.materialCost)}</p>
      <p>Labour hours: {fmt(result.labourHours)}</p>
      <p>Estimated working days: {fmt(result.estimatedWorkDays)} (schedule estimate, not a promise)</p>
      <p>Internal labour cost: ${fmt(result.labourCost)}</p>
      <p>Estimated customer subtotal (before overhead, contingency and HST): ${fmt(result.customerSubtotal)}</p>
      {reasons.length > 0 && <div role="status"><strong>Review required</strong><ul>
        {reasons.map(reason => <li key={reason}>{reason}</li>)}
      </ul></div>}
      <label><input type="checkbox" checked={confirmed}
        onChange={e => setConfirmed(e.target.checked)} />
        I have reviewed these quantities, productivity assumptions and costs.</label>
      <button type="button" disabled={!ready || !onApprove} onClick={() => onApprove?.(input)}>
        Approve reviewed estimate
      </button>
    </section>
  );
}
