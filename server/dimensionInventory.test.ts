import { expect, it } from "vitest";
import { openAIProvider } from "./provider";
import { structuredTakeoffFixture } from "../src/structuredTakeoff.fixture";
it("reads compact visual dimensions from a raster-only PDF in one unchanged-model request", async () => {
  const r = structuredTakeoffFixture();
  r.dimensionInventory = r.dimensions![0].drawingDimensions!.map((d) => ({
    ...d,
    documentId: "synthetic",
    page: 1,
  }));
  r.dimensions = [];
  let calls = 0;
  const original =
    "data:application/pdf;base64," +
    btoa("%PDF-1.7\nsynthetic raster-only placeholder\n%%EOF");
  const provider = openAIProvider(
    "test-only-placeholder",
    undefined,
    async (_url, init) => {
      calls++;
      const payload = JSON.parse(String(init!.body));
      expect(payload.model).toBe("gpt-5.4-mini");
      expect(payload.store).toBe(false);
      expect(payload.max_output_tokens).toBe(12000);
      expect(payload.instructions).toContain("RASTER-ONLY SHEETS");
      expect(payload.instructions).toContain("SECTION-FIRST TAKEOFF");
      expect(payload.text.format.strict).toBe(true);
      expect(payload.text.format.schema.required).toContain(
        "dimensionInventory",
      );
      expect(
        payload.input[0].content.find(
          (c: { type: string }) => c.type === "input_file",
        ).file_data,
      ).toBe(original);
      expect(JSON.stringify(payload)).not.toContain("test-only-placeholder");
      return Response.json({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(r) }] },
        ],
      });
    },
  );
  const result = await provider.analyze(
    [
      {
        id: "synthetic",
        name: "Synthetic.pdf",
        type: "application/pdf",
        data: original,
        pdfText: {
          pageCount: 1,
          truncated: false,
          pages: [
            {
              page: 1,
              width: 1728,
              height: 2592,
              text: "",
              status: "No selectable text",
            },
          ],
        },
      },
    ],
    new AbortController().signal,
  );
  expect(calls).toBe(1);
  expect(result.dimensions![0].drawingDimensions).toHaveLength(2);
  expect(
    result.suggestions[0].materialInputs!.some(
      (f) => f.field === "layoutLength" && f.value === 16,
    ),
  ).toBe(true);
  expect(result.dimensionDecisions!.some((d) => d.status === "Assigned")).toBe(
    true,
  );
  expect(result.suggestions.every((s) => !("status" in s))).toBe(true);
});
