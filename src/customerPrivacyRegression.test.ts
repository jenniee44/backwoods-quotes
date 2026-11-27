import { describe, it, expect } from "vitest";
import { seed, calculate, estimateFor, markSent } from "./model";
import { customerDocument } from "./customerDocument";

describe("customer document privacy", () => {
  it("excludes private notes and raw costing fields in both quote modes", () => {
    const q = seed().quotes[0];
    q.notes = "PRIVATE_INTERNAL_NOTE_123";
    q.lines[0].description = "PRIVATE_LINE_DESCRIPTION_123";
    q.lines[0].supplier = "PRIVATE_SUPPLIER_123";
    q.lines[0].materialNotes = "PRIVATE_MATERIAL_NOTE_123";
    for (const mode of ["Simplified", "Detailed"] as const) {
      q.mode = mode;
      const doc = customerDocument(q);
      const json = JSON.stringify(doc);
      expect(json).not.toContain("PRIVATE_");
      for (const key of ["cost", "rate", "markup", "profit", "margin", "pricing", "takeoff", "analysisReports", "notes", "supplier"]) {
        expect(json).not.toContain(JSON.stringify(key) + ":");
      }
      expect(doc.total).toBe(calculate(estimateFor(q)).total);
      expect(Math.round(doc.rows.reduce((sum, row) => sum + row.amount, 0) * 100)).toBe(Math.round(doc.subtotal * 100));
    }
  });

  it("uses locked historical prices and reconciles exposed contingency", () => {
    const q = markSent(seed().quotes[0]);
    const total = customerDocument(q).total;
    q.pricing.labourRate = 999;
    q.lines[0].quantity = 999;
    q.details.exposeContingency = true;
    const doc = customerDocument(q);
    expect(doc.total).toBe(total);
    expect(Math.round(doc.rows.reduce((sum, row) => sum + row.amount, 0) * 100)).toBe(Math.round(doc.subtotal * 100));
  });
});
