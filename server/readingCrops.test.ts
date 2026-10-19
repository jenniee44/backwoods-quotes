import { expect, it } from "vitest";
import { openAIProvider } from "./provider";
import type { PdfDetailRegion } from "../shared/pdf";
const header = new Uint8Array(24);
header.set([137, 80, 78, 71, 13, 10, 26, 10]);
header.set([73, 72, 68, 82], 12);
new DataView(header.buffer).setUint32(16, 500);
new DataView(header.buffer).setUint32(20, 500);
const mappedDetail: PdfDetailRegion = {
  page: 1,
  x: 0,
  y: 0,
  width: 144,
  height: 144,
  pageWidth: 800,
  pageHeight: 600,
  dpi: 250,
  pixelWidth: 500,
  pixelHeight: 500,
  data: "data:image/png;base64," + btoa(String.fromCharCode(...header)),
  rotation: 0,
  sourcePageRotation: 0,
};
import { analysisFixture } from "../shared/analysis.fixture";
import { validateDocuments } from "../shared/analysis";
it("submits original, text and enlarged crops in one existing-model request with explicit cross-view coordinate mapping", async () => {
  const data =
    "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF");
  const docs = validateDocuments([
    {
      id: "synthetic",
      name: "Synthetic.pdf",
      type: "application/pdf",
      data,
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
                x: 0.2,
                y: 0.1,
                width: 0.15,
                height: 0.01,
                angle: 0,
              },
            ],
          },
        ],
      },
      detailRegions: [mappedDetail],
    },
  ]);
  let calls = 0;
  const provider = openAIProvider(
    "test-only-placeholder",
    undefined,
    async (_url, init) => {
      calls++;
      const payload = JSON.parse(String(init!.body));
      expect(payload.model).toBe("gpt-5.4-mini");
      expect(payload.instructions).toContain("READING CROP ASSOCIATION");
      const content = payload.input[0].content;
      expect(
        content.find((c: { type: string }) => c.type === "input_file")
          .file_data,
      ).toBe(data);
      expect(
        content.find((c: { type: string }) => c.type === "input_image")
          .image_url,
      ).toBe(mappedDetail.data);
      const embedded = content.find((c: { text?: string }) =>
        c.text?.includes("untrustedEmbeddedPdfText"),
      );
      expect(JSON.parse(embedded.text).untrustedEmbeddedPdfText).toEqual(
        docs[0].pdfText,
      );
      const reference = JSON.parse(
        content.find((c: { type: string; text?: string }) =>
          c.text?.includes("originalPageMapping"),
        ).text,
      );
      expect(reference.originalPageMapping.originalPageRotation).toBe(0);
      expect(reference.physicalPdfPage).toBe(1);
      expect(reference.sourceId).toBe("synthetic");
      return Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify(analysisFixture("synthetic")),
              },
            ],
          },
        ],
      });
    },
  );
  await provider.analyze(docs, new AbortController().signal);
  expect(calls).toBe(1);
});
