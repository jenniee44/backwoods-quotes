import { AnalysisFailure } from "../shared/analysisErrors";
import { detailSourceMapping } from "../shared/detailCoordinates";
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
            documents.map((d) => ({
              sourceId: d.id,
              type: d.type,
              sourceRole: "Complete original document",
              physicalPdfPages: d.pdfText?.pageCount ?? null,
            })),
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
              clockwiseOrientationDegrees: region.rotation ?? 0,
              rotatedPageTopLeftPoints: location,
              originalPageMapping: detailSourceMapping(region),
              note: "Orientation is the absolute clockwise PDF viewport rotation, including the PDF page’s intrinsic rotation. 250 DPI detail rendered directly from original PDF, not a preview thumbnail. Coordinates locate the region only; never infer site dimensions from pixels. Cite the original source ID and page.",
            }),
          });
          content.push({
            type: "input_image",
            image_url: data,
            detail: "high",
          });
        }
      });
      let response: Response;
      try {
        response = await request("https://api.openai.com/v1/responses", {
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
      } catch (e) {
        if (signal.aborted) throw signal.reason ?? e;
        throw new AnalysisFailure("ANALYSIS_PROVIDER_UNAVAILABLE");
      }
      if (!response.ok) {
        let code = "";
        try {
          const rawError = await response.text();
          if (rawError.length < 100000)
            code = String(JSON.parse(rawError)?.error?.code ?? "");
        } catch {
          /* Never expose raw provider responses. */
        }
        throw new AnalysisFailure(
          response.status === 429
            ? code === "insufficient_quota"
              ? "ANALYSIS_PROVIDER_QUOTA"
              : "ANALYSIS_PROVIDER_BUSY"
            : code === "invalid_json_schema"
              ? "ANALYSIS_SCHEMA_REJECTED"
              : code === "model_not_found"
                ? "ANALYSIS_PROVIDER_MODEL"
                : [401, 403, 404].includes(response.status)
                  ? "ANALYSIS_PROVIDER_AUTH"
                  : response.status === 413 ||
                      [
                        "context_length_exceeded",
                        "string_above_max_length",
                      ].includes(code)
                    ? "ANALYSIS_INPUT_LIMIT"
                    : response.status >= 500
                      ? "ANALYSIS_PROVIDER_UNAVAILABLE"
                      : "ANALYSIS_PROVIDER_REQUEST",
        );
      }
      const raw = await response.text();
      if (raw.length > 1_000_000)
        throw new AnalysisFailure("ANALYSIS_INVALID_OUTPUT");
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new AnalysisFailure("ANALYSIS_INVALID_OUTPUT");
      }
      if (body.status !== "completed" || !Array.isArray(body.output))
        throw new AnalysisFailure(
          body.incomplete_details?.reason === "max_output_tokens"
            ? "ANALYSIS_OUTPUT_LIMIT"
            : "ANALYSIS_INCOMPLETE",
        );
      const contents = body.output.flatMap(
        (output: { content?: { type: string; text?: string }[] }) =>
          output.content ?? [],
      );
      if (contents.some((c: { type: string }) => c.type === "refusal"))
        throw new AnalysisFailure("ANALYSIS_REFUSED");
      const parts = contents.filter(
        (c: { type: string }) => c.type === "output_text",
      );
      if (parts.length !== 1 || typeof parts[0].text !== "string")
        throw new AnalysisFailure("ANALYSIS_INVALID_OUTPUT");
      try {
        return validateAnalysis(
          JSON.parse(parts[0].text),
          documents.map((d) => d.id),
          documents,
        );
      } catch {
        throw new AnalysisFailure("ANALYSIS_INVALID_OUTPUT");
      }
    },
  };
}
