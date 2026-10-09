import { expect, it } from "vitest";
import { openAIProvider } from "./provider";
import { analysisFixture } from "../shared/analysis.fixture";
import { analysisSchema } from "../shared/analysis";
it("native source and structured extraction retain exact member notation while unsupported quantities and hours are removed", async () => {
  const fixture = analysisFixture("synthetic-plan");
  const base = fixture.suggestions[1];
  fixture.suggestions = [
    {
      ...base,
      description: "Beam",
      specification: "4PLY 2X12 SYP",
      quantity: 18,
      quantityMethod: "Unknown",
      sourceFacts: ["Page 1 beam callout: 4PLY 2X12 SYP"],
      location: "Rear deck",
    },
    {
      ...base,
      description: "Deck joists",
      specification: "2X8 PT @ 16 IN O/C",
      quantity: 19,
      quantityMethod: "Calculated",
      calculationBasis: "",
      sourceFacts: [
        "Page 1 joist size and spacing; perpendicular span missing",
      ],
    },
    { ...fixture.suggestions[0], quantity: 8 },
  ];
  const data =
    "data:application/pdf;base64," + btoa("%PDF-1.7\nSynthetic fixture\n%%EOF");
  let payload: Record<string, unknown> = {};
  const provider = openAIProvider(
    "test-only-placeholder",
    undefined,
    async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({
        status: "completed",
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(fixture) }] },
        ],
      });
    },
  );
  const result = await provider.analyze(
    [
      {
        id: "synthetic-plan",
        name: "synthetic.pdf",
        type: "application/pdf",
        data,
      },
    ],
    new AbortController().signal,
  );
  expect(
    result.suggestions.find((s) => s.description === "Beam")?.specification,
  ).toBe("4PLY 2X12 SYP");
  expect(result.suggestions.every((s) => s.quantity === null)).toBe(true);
  expect(
    result.suggestions
      .find((s) => s.description === "Deck joists")
      ?.sourceFacts?.join(),
  ).toContain("perpendicular span missing");
  expect(payload.model).toBe("gpt-5.4-mini");
  expect(payload.store).toBe(false);
  expect(
    (payload.text as { format: { schema: unknown; strict: boolean } }).format,
  ).toMatchObject({ schema: analysisSchema, strict: true });
  const input = payload.input as {
    content: { type: string; file_data?: string }[];
  }[];
  expect(input[0].content.find((c) => c.type === "input_file")?.file_data).toBe(
    data,
  );
});
