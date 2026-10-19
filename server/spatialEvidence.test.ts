import { expect, it } from "vitest";
import { openAIProvider } from "./provider";
import { analysisFixture } from "../shared/analysis.fixture";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
import { analysisSchema, validateDocuments } from "../shared/analysis";
it("sends unchanged PDF plus bounded untrusted positions in one secured existing-model request and returns proposed spatial evidence", async () => {
  const fixture = analysisFixture("synthetic");
  fixture.suggestions = [
    {
      ...fixture.suggestions[1],
      description: "Deck beams",
      category: "Beams",
      specification: "3PLY 2X10 PT",
      location: "Deck A",
      notes: "New work",
      quantity: null,
      unit: "runs",
      beamAssemblies: syntheticDeckBeams(),
    },
  ];
  const original =
    "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF");
  const docs = validateDocuments([
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
            width: 800,
            height: 600,
            text: "3PLY 2X10 PT",
            status: "Available",
            positions: [
              {
                text: "3PLY 2X10 PT",
                x: 0.3,
                y: 0.29,
                width: 0.1,
                height: 0.01,
                angle: 0,
              },
            ],
            positionsTruncated: false,
          },
        ],
      },
    },
  ]);
  let count = 0;
  const provider = openAIProvider(
    "test-only-placeholder",
    undefined,
    async (_url, init) => {
      count++;
      const payload = JSON.parse(String(init!.body));
      expect(payload.model).toBe("gpt-5.4-mini");
      expect(payload.instructions).toContain("SPATIAL BEAM ASSEMBLY PASS");
      expect(payload.instructions).toContain("not only flattened text");
      expect(JSON.stringify(payload)).not.toContain("test-only-placeholder");
      const content = payload.input[0].content;
      expect(
        content.find((c: { type: string }) => c.type === "input_file")
          .file_data,
      ).toBe(original);
      const supplemental = content.find(
        (c: { type: string; text?: string }) =>
          c.type === "input_text" &&
          c.text?.includes("untrustedEmbeddedPdfText"),
      );
      expect(
        JSON.parse(supplemental.text).untrustedEmbeddedPdfText.pages[0]
          .positions,
      ).toEqual(docs[0].pdfText!.pages[0].positions);
      expect(payload.text.format.schema).toEqual(analysisSchema);
      return Response.json({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(fixture) }] },
        ],
      });
    },
  );
  const result = await provider.analyze(docs, new AbortController().signal);
  expect(count).toBe(1);
  expect(result.suggestions[0].beamAssemblies).toEqual(syntheticDeckBeams());
  expect(result.suggestions[0].quantity).toBeNull();
  expect(result.suggestions[0]).not.toHaveProperty("status");
});
