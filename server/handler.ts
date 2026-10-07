import { authorize } from "./access";
import type { AccessEnv } from "./access";
import { validateDocuments, validateAnalysis } from "../shared/analysis";
import { openAIProvider } from "./provider";
import type { AnalysisProvider } from "./provider";
export type Env = AccessEnv & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANALYSIS_LIMITS?: {
    get(key: string): Promise<string | null>;
    put(
      key: string,
      value: string,
      options: { expirationTtl: number },
    ): Promise<void>;
  };
};
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function boundedBody(request: Request) {
  if (!request.body) throw new Error("Attach plans before analyzing.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 6_000_000) {
        await reader.cancel();
        throw new Error("The plan upload is too large. Use smaller files.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((c) => {
    bytes.set(c, offset);
    offset += c.length;
  });
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleAnalysis(
  request: Request,
  env: Env,
  provider?: AnalysisProvider,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "Use Analyze Plans to send attached files." }, 405);
  const local =
    env.DEV_ALLOW_LOCAL === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
  if (request.headers.get("Origin") !== new URL(request.url).origin && !local)
    return json(
      { error: "Open analysis from the Backwoods app on this site." },
      403,
    );
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return json({ error: "The plan request format is unsupported." }, 415);
  let user: string;
  try {
    user = await authorize(request, env);
  } catch (e) {
    return json(
      {
        error:
          (e as Error).message === "CONFIG_AUTH"
            ? "Plan analysis needs Cloudflare Access configuration. Follow the README setup steps."
            : "Sign in through Cloudflare Access to analyze plans.",
      },
      (e as Error).message === "CONFIG_AUTH" ? 503 : 401,
    );
  }
  if (!env.OPENAI_API_KEY && !provider)
    return json(
      {
        error:
          "Plan analysis is not configured. Add the server-side OPENAI_API_KEY secret; see README.",
      },
      503,
    );
  if (!local && !env.ANALYSIS_LIMITS)
    return json(
      {
        error:
          "Plan analysis needs its private rate-limit storage binding; see README.",
      },
      503,
    );
  let documents;
  try {
    const input = await boundedBody(request);
    documents = validateDocuments(input.documents);
  } catch (e) {
    return json(
      {
        error:
          e instanceof SyntaxError
            ? "The plan upload could not be read. Try again."
            : (e as Error).message,
      },
      400,
    );
  }
  try {
    if (env.ANALYSIS_LIMITS) {
      const hash = async (text: string) =>
        Array.from(
          new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(text),
            ),
          ),
        )
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
      const userHash = await hash(user);
      const fingerprint = await hash(
        documents.map((d) => d.id + ":" + d.data).join("|"),
      );
      const key = `request:${userHash}:${fingerprint}`;
      if (await env.ANALYSIS_LIMITS.get(key))
        return json(
          {
            error:
              "These plans were recently analyzed or are being analyzed. Wait two minutes before retrying.",
          },
          409,
        );
      const day = `daily:${userHash}:${new Date().toISOString().slice(0, 10)}`;
      const count = Number((await env.ANALYSIS_LIMITS.get(day)) ?? 0);
      if (count >= 20)
        return json(
          { error: "The daily plan-analysis limit was reached. Try tomorrow." },
          429,
        );
      await env.ANALYSIS_LIMITS.put(day, String(count + 1), {
        expirationTtl: 172800,
      });
      await env.ANALYSIS_LIMITS.put(key, "in-progress", { expirationTtl: 120 });
    }
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(90000),
    ]);
    const result = await (
      provider ?? openAIProvider(env.OPENAI_API_KEY!, env.OPENAI_MODEL)
    ).analyze(documents, signal);
    return json(
      validateAnalysis(
        result,
        documents.map((d) => d.id),
      ),
    );
  } catch (e) {
    if (
      (e as Error).name === "AbortError" ||
      (e as Error).name === "TimeoutError"
    )
      return json(
        {
          error:
            "Analysis was interrupted or took too long. Existing estimates are safe; retry with fewer pages.",
        },
        504,
      );
    // Provider errors are deliberately generic; never log request bodies or secrets.
    return json(
      {
        error:
          "Plans could not be analyzed. Check the provider configuration, try fewer/clearer pages, or use manual takeoff.",
      },
      502,
    );
  }
}
