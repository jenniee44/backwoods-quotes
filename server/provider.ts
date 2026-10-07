import { planAnalysisInstructions } from "./instructions";
import { analysisSchema, validateAnalysis } from "../shared/analysis";
import type { AnalysisDocument, PlanAnalysisResult } from "../shared/analysis";
export interface AnalysisProvider {
  analyze(
    documents: AnalysisDocument[],
    signal: AbortSignal,
  ): Promise<PlanAnalysisResult>;
}
export function openAIProvider(
  key: string,
  model = "gpt-5.4-mini",
  request: typeof fetch = fetch,
): AnalysisProvider {
  return {
    async analyze(documents, signal) {
      const content: Record<string, unknown>[] = [
        {
          type: "input_text",
          text: JSON.stringify(
            documents.map((d) => ({ sourceId: d.id, type: d.type })),
          ),
        },
      ];
      documents.forEach((d, i) => {
        content.push(
          d.type === "application/pdf"
            ? {
                type: "input_file",
                filename: `plan-${i + 1}.pdf`,
                file_data: d.data,
              }
            : { type: "input_image", image_url: d.data, detail: "high" },
        );
        if (d.pdfText)
          content.push({
            type: "input_text",
            text: JSON.stringify({
              sourceId: d.id,
              untrustedEmbeddedPdfText: d.pdfText,
            }),
          });
        for (const [index, region] of (d.detailRegions ?? []).entries()) {
          const { data, ...location } = region;
          content.push({
            type: "input_text",
            text: JSON.stringify({
              sourceId: d.id,
              detailView: index + 1,
              physicalPdfPage: region.page,
              rotatedPageTopLeftPoints: location,
              note: "250 DPI detail rendered directly from original PDF, not a preview thumbnail. Coordinates locate the region only; never infer site dimensions from pixels. Cite the original source ID and page.",
            }),
          });
          content.push({
            type: "input_image",
            image_url: data,
            detail: "high",
          });
        }
      });
      const response = await request("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          instructions: planAnalysisInstructions,
          input: [{ role: "user", content }],
          text: {
            format: {
              type: "json_schema",
              name: "construction_takeoff",
              strict: true,
              schema: analysisSchema,
            },
          },
          max_output_tokens: 12000,
        }),
        signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "The analysis provider is busy or its usage limit was reached. Try later."
            : "The analysis provider could not process the plans. Check the server configuration or try a clearer file.",
        );
      const raw = await response.text();
      if (raw.length > 1_000_000)
        throw new Error("The analysis response was too large.");
      const body = JSON.parse(raw);
      if (body.status !== "completed" || !Array.isArray(body.output))
        throw new Error(
          "The analysis was incomplete. Try fewer pages or clearer plans.",
        );
      const parts = body.output
        .flatMap(
          (output: { content?: { type: string; text?: string }[] }) =>
            output.content ?? [],
        )
        .filter((c: { type: string }) => c.type === "output_text");
      if (parts.length !== 1 || typeof parts[0].text !== "string")
        throw new Error("The analysis did not return a usable takeoff.");
      return validateAnalysis(
        JSON.parse(parts[0].text),
        documents.map((d) => d.id),
      );
    },
  };
}
