import {
  AnalysisFailure,
  analysisErrors,
  isAnalysisErrorCode,
  type AnalysisErrorCode,
} from "../shared/analysisErrors";
import {
  digest,
  sourceDigest,
  globalAnalysis,
  type AnalysisIdentity,
} from "../shared/analysisRecovery";
import {
  validateAnalysis,
  type AnalysisDocument,
  type PlanAnalysisResult,
} from "../shared/analysis";
import { abortableAnalysis } from "../shared/abortableAnalysis";
import { reserveAnalysis, finishAnalysis } from "./analysisLease";
import { openAIProvider, type AnalysisProvider } from "./provider";
import type { Env } from "./handler";
export type ResultsKV = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
};
const ttl = 7 * 24 * 60 * 60;
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const validId = (id: unknown) =>
  typeof id === "string" && /^[a-f0-9]{64}$/.test(id);
const validQuote = (id: unknown) =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 100 &&
  /^[\w-]+$/.test(id);
type Job = {
  version: 1;
  analysisId: string;
  sourceDigest: string;
  batchCount: number;
  sourceIds: string[];
};
type State = {
  phase: "running" | "failed";
  started: number;
  code?: AnalysisErrorCode;
};
export function validIdentity(
  v: unknown,
  docs: AnalysisDocument[],
): v is AnalysisIdentity {
  if (!v || typeof v !== "object") return false;
  const c = v as AnalysisIdentity;
  return (
    validId(c.analysisId) &&
    validQuote(c.quoteId) &&
    Number.isInteger(c.batchCount) &&
    c.batchCount >= 1 &&
    c.batchCount <= 24 &&
    Number.isInteger(c.batchIndex) &&
    c.batchIndex >= 0 &&
    c.batchIndex < c.batchCount &&
    !!c.indices &&
    typeof c.indices === "object" &&
    !Array.isArray(c.indices) &&
    Object.keys(c.indices).every((id) => docs.some((d) => d.id === id)) &&
    docs.every((d) => {
      const indices = c.indices[d.id] ?? [];
      return (
        Array.isArray(indices) &&
        indices.length === (d.detailRegions?.length ?? 0) &&
        new Set(indices).size === indices.length &&
        indices.every((i) => Number.isInteger(i) && i >= 1 && i <= 24)
      );
    })
  );
}
const prefix = async (user: string, quote: string) =>
  `analysis:v1:${await digest(user)}:${await digest(quote)}`;
async function jobAt(kv: ResultsKV, key: string): Promise<Job | null> {
  const raw = await kv.get(key);
  if (!raw) return null;
  const job = JSON.parse(raw) as Job;
  if (
    !job ||
    job.version !== 1 ||
    !validId(job.analysisId) ||
    !validId(job.sourceDigest) ||
    !Number.isInteger(job.batchCount) ||
    job.batchCount < 1 ||
    job.batchCount > 24 ||
    !Array.isArray(job.sourceIds) ||
    !job.sourceIds.length ||
    job.sourceIds.length > 8 ||
    !job.sourceIds.every((id) => typeof id === "string" && id.length <= 100)
  )
    throw new Error("Invalid saved analysis manifest.");
  return job;
}
export async function recoverResults(
  input: Record<string, unknown>,
  user: string,
  env: Env,
) {
  if (
    !validQuote(input.quoteId) ||
    !validId(input.sourceDigest) ||
    (input.analysisId !== undefined && !validId(input.analysisId))
  )
    return reply({ error: "The saved-analysis reference is invalid." }, 400);
  if (!env.ANALYSIS_RESULTS)
    return reply(
      {
        code: "ANALYSIS_RESULTS_UNAVAILABLE",
        state: "storage-unavailable",
        error:
          "Saved-result storage ANALYSIS_RESULTS is not bound in this deployment environment. No AI request was made.",
      },
      503,
    );
  try {
    const p = await prefix(user, input.quoteId as string);
    const id =
      input.analysisId ??
      (await env.ANALYSIS_RESULTS.get(`${p}:latest:${input.sourceDigest}`));
    const job = validId(id)
      ? await jobAt(env.ANALYSIS_RESULTS, `${p}:job:${id}`)
      : null;
    if (!job || job.sourceDigest !== input.sourceDigest)
      return reply(
        {
          state: "missing",
          code: "ANALYSIS_RESULT_MISSING",
          error:
            "No saved AI result was found for this quote and these exact source files. This does not mean AI analysis failed. No paid AI request was made.",
        },
        404,
      );
    const batches: PlanAnalysisResult[] = [];
    for (let i = 0; i < job.batchCount; i++) {
      const raw = await env.ANALYSIS_RESULTS.get(
        `${p}:${job.analysisId}:${i}:result`,
      );
      if (raw) {
        batches.push(validateAnalysis(JSON.parse(raw), job.sourceIds));
        continue;
      }
      const marker = await env.ANALYSIS_RESULTS.get(
        `${p}:${job.analysisId}:${i}:state`,
      );
      const state: State | undefined = marker ? JSON.parse(marker) : undefined;
      if (state?.phase === "failed")
        return reply(
          {
            state: "failed",
            analysisId: job.analysisId,
            completedBatches: batches.length,
            totalBatches: job.batchCount,
            code: state.code ?? "ANALYSIS_FAILED",
            error: new AnalysisFailure(
              state.code && isAnalysisErrorCode(state.code)
                ? state.code
                : "ANALYSIS_FAILED",
            ).message,
          },
          409,
        );
      const running =
        state?.phase === "running" && Date.now() - state.started < 130000;
      return reply(
        {
          state: running ? "running" : state ? "interrupted" : "missing",
          analysisId: job.analysisId,
          completedBatches: batches.length,
          totalBatches: job.batchCount,
          code: running
            ? "ANALYSIS_IN_PROGRESS"
            : state
              ? "ANALYSIS_INTERRUPTED"
              : "ANALYSIS_RESULT_MISSING",
          error: running
            ? "Analysis is still running. Check saved results again shortly; no new AI request was made."
            : state
              ? "The request did not leave a completed saved result before its running window ended. Its provider outcome is uncertain; recovery will not send it again."
              : "Some batches have no saved result. No paid AI request was made; do not assume an unfinished batch completed.",
        },
        running ? 202 : 404,
      );
    }
    return reply({
      state: "completed",
      analysisId: job.analysisId,
      persistence: "confirmed",
      batches,
      completedBatches: job.batchCount,
      totalBatches: job.batchCount,
    });
  } catch {
    return reply(
      {
        state: "storage-unavailable",
        code: "ANALYSIS_RESULTS_UNAVAILABLE",
        error:
          "Saved-result storage could not be read safely. No AI request was made. Try recovery later; existing estimates are unchanged.",
      },
      503,
    );
  }
}
export async function persistentAnalysis(
  request: Request,
  env: Env,
  user: string,
  docs: AnalysisDocument[],
  identity: AnalysisIdentity,
  provider?: AnalysisProvider,
  waitUntil?: (work: Promise<unknown>) => void,
) {
  const kv = env.ANALYSIS_RESULTS;
  if (!kv)
    return reply(
      {
        code: "ANALYSIS_RESULTS_UNAVAILABLE",
        error:
          "Plan analysis needs its private ANALYSIS_RESULTS binding in this deployment environment. No AI request was made.",
      },
      503,
    );
  const p = await prefix(user, identity.quoteId),
    key = `${p}:${identity.analysisId}:${identity.batchIndex}`,
    jobKey = `${p}:job:${identity.analysisId}`;
  const originalDigest = await sourceDigest(docs);
  try {
    const old = await jobAt(kv, jobKey);
    if (
      old &&
      (old.sourceDigest !== originalDigest ||
        old.batchCount !== identity.batchCount)
    )
      return reply(
        {
          code: "ANALYSIS_SOURCE_MISMATCH",
          error:
            "This analysis reference belongs to a different source package. No AI request was made.",
        },
        409,
      );
    const saved = await kv.get(`${key}:result`);
    if (saved)
      return reply({
        state: "completed",
        analysisId: identity.analysisId,
        persistence: "confirmed",
        reused: true,
        result: validateAnalysis(
          JSON.parse(saved),
          docs.map((d) => d.id),
        ),
      });
    const job: Job = {
      version: 1,
      analysisId: identity.analysisId,
      sourceDigest: originalDigest,
      batchCount: identity.batchCount,
      sourceIds: docs.map((d) => d.id),
    };
    await kv.put(jobKey, JSON.stringify(job), { expirationTtl: ttl });
    await kv.put(`${p}:latest:${originalDigest}`, identity.analysisId, {
      expirationTtl: ttl,
    });
  } catch {
    return reply(
      {
        code: "ANALYSIS_RESULTS_UNAVAILABLE",
        error:
          "Saved-result storage could not be prepared. No AI request was made.",
      },
      503,
    );
  }
  if (request.signal.aborted)
    return reply(
      {
        code: "ANALYSIS_INTERRUPTED",
        error: "The request was cancelled before AI analysis started.",
      },
      409,
    );
  let lease: Awaited<ReturnType<typeof reserveAnalysis>> | undefined;
  try {
    if (env.ANALYSIS_LIMITS)
      lease = await reserveAnalysis(
        env.ANALYSIS_LIMITS,
        `request:${await digest(user)}:${identity.analysisId}:${identity.batchIndex}`,
        `daily:${await digest(user)}:${new Date().toISOString().slice(0, 10)}`,
      );
    await kv.put(
      `${key}:state`,
      JSON.stringify({ phase: "running", started: Date.now() }),
      { expirationTtl: ttl },
    );
  } catch (e) {
    if (lease) await finishAnalysis(lease, "failed").catch(() => {});
    const failure =
      e instanceof AnalysisFailure
        ? e
        : new AnalysisFailure("ANALYSIS_RESULTS_UNAVAILABLE");
    return reply(
      {
        code: failure.code,
        error: failure.message,
        ...(failure.retryAfterSeconds
          ? { retryAfterSeconds: failure.retryAfterSeconds }
          : {}),
      },
      analysisErrors[failure.code].status,
    );
  }
  const work = (async () => {
    let completed = false;
    try {
      // An already-approved request can finish after its browser disconnects.
      // Recovery never starts/resends work. Runtime lifetime is still bounded.
      const raw = await abortableAnalysis(
        (signal) =>
          (
            provider ?? openAIProvider(env.OPENAI_API_KEY!, env.OPENAI_MODEL)
          ).analyze(docs, signal),
        new AbortController().signal,
        90000,
      );
      let result: PlanAnalysisResult;
      try {
        result = globalAnalysis(
          validateAnalysis(
            raw,
            docs.map((d) => d.id),
            docs,
          ),
          docs,
          identity.indices,
        );
      } catch {
        throw new AnalysisFailure("ANALYSIS_INVALID_OUTPUT");
      }
      completed = true;
      let persistence: "confirmed" | "failed" = "confirmed";
      try {
        await kv.put(`${key}:result`, JSON.stringify(result), {
          expirationTtl: ttl,
        });
      } catch {
        persistence = "failed";
        await kv
          .put(
            `${key}:state`,
            JSON.stringify({
              phase: "failed",
              started: Date.now(),
              code: "ANALYSIS_PERSISTENCE_FAILED",
            }),
            { expirationTtl: ttl },
          )
          .catch(() => {});
      }
      let trackingWarning = false;
      if (lease)
        await finishAnalysis(lease, "succeeded").catch(() => {
          trackingWarning = true;
        });
      return reply({
        state: "completed",
        analysisId: identity.analysisId,
        persistence,
        result,
        ...(persistence === "failed"
          ? {
              warning:
                "AI completed, but server persistence could not be confirmed. Keep this tab open and save/export the quote. Do not pay to analyze again.",
            }
          : {}),
        ...(trackingWarning
          ? {
              trackingWarning:
                "Result is available, but duplicate-request tracking cleanup was not confirmed.",
            }
          : {}),
      });
    } catch (e) {
      const failure =
        e instanceof AnalysisFailure
          ? e
          : new AnalysisFailure("ANALYSIS_FAILED");
      await kv
        .put(
          `${key}:state`,
          JSON.stringify({
            phase: "failed",
            started: Date.now(),
            code: failure.code,
          }),
          { expirationTtl: ttl },
        )
        .catch(() => {});
      if (lease)
        await finishAnalysis(lease, completed ? "succeeded" : "failed").catch(
          () => {},
        );
      return reply(
        { state: "failed", code: failure.code, error: failure.message },
        analysisErrors[failure.code].status,
      );
    }
  })();
  waitUntil?.(work);
  return work;
}
