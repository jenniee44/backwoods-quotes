import { expect, it } from "vitest";
import { openAIProvider } from "./provider";
import { analysisFixture } from "../shared/analysis.fixture";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
it("asks for the plan layout independently of materials in one unchanged-model request", async () => {
  const r = analysisFixture("synthetic");
  r.suggestions = [];
  r.dimensions = [];
  r.sourceObservations = [];
  r.beamLayoutInventory = syntheticDeckBeams().map((b) => ({
    ...b,
    view: "Framing plan",
    documentId: "synthetic",
    location: "Main framing plan",
    sourceDetailView: null,
  }));
  let calls = 0;
  const provider = openAIProvider(
    "test-only-placeholder",
    undefined,
    async (_url, init) => {
      calls++;
      const payload = JSON.parse(String(init!.body));
      expect(payload.model).toBe("gpt-5.4-mini");
      expect(payload.store).toBe(false);
      expect(payload.max_output_tokens).toBe(12000);
      expect(payload.instructions).toContain(
        "BEAM LAYOUT INVENTORY BEFORE MATERIALS",
      );
      expect(payload.instructions).toContain(
        "Counts vary with actual evidence",
      );
      expect(payload.text.format.schema.required).toContain(
        "beamLayoutInventory",
      );
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
        data: "data:application/pdf;base64," + btoa("%PDF-1.7 synthetic %%EOF"),
      },
    ],
    new AbortController().signal,
  );
  expect(calls).toBe(1);
  expect(result.suggestions).toHaveLength(1);
  expect(result.suggestions[0].beamAssemblies).toHaveLength(3);
  expect(result.sourceObservations).toHaveLength(3);
  expect(result.suggestions[0].quantity).toBeNull();
});
