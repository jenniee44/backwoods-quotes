import { afterEach, expect, it, vi } from "vitest";
import { handleAnalysis } from "./handler";
import { openAIProvider } from "./provider";
import { finishAnalysis, reserveAnalysis } from "./analysisLease";
import { AnalysisFailure } from "../shared/analysisErrors";
import { analysisFixture } from "../shared/analysis.fixture";
const document = {
  id: "plan",
  name: "synthetic.pdf",
  type: "application/pdf",
  data:
    "data:application/pdf;base64," + btoa("%PDF-1.7\nSYNTHETIC_ONLY\n%%EOF"),
};
const req = (signal?: AbortSignal) =>
  new Request("http://localhost/api/plan-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify({ documents: [document] }),
    signal,
  });
function setup() {
  const values = new Map<string, string>();
  const kv = {
    get: vi.fn(async (k: string) => values.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => {
      values.set(k, v);
    }),
  };
  return { values, kv, env: { DEV_ALLOW_LOCAL: "true", ANALYSIS_LIMITS: kv } };
}
afterEach(() => vi.useRealTimers());
it("provider failure releases owned pending protection, preserves the daily charge and permits a fresh retry", async () => {
  const { env, values, kv } = setup();
  let calls = 0;
  const provider = {
    analyze: async () => {
      if (++calls === 1) throw new AnalysisFailure("ANALYSIS_PROVIDER_QUOTA");
      return analysisFixture();
    },
  };
  const first = await handleAnalysis(req(), env, provider);
  expect(first.status).toBe(503);
  expect(await first.json()).toMatchObject({ code: "ANALYSIS_PROVIDER_QUOTA" });
  expect([...values].find(([k]) => k.startsWith("request:"))?.[1]).toContain(
    '"phase":"failed"',
  );
  const next = await handleAnalysis(req(), env, provider);
  expect(next.status).toBe(200);
  expect(calls).toBe(2);
  expect([...values].find(([k]) => k.startsWith("daily:"))?.[1]).toBe("2");
  expect(JSON.stringify(kv.put.mock.calls)).not.toContain("SYNTHETIC_ONLY");
  expect(JSON.stringify(kv.put.mock.calls)).not.toContain("synthetic.pdf");
  const duplicate = await handleAnalysis(req(), env, provider);
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({
    code: "ANALYSIS_COOLDOWN",
    retryAfterSeconds: expect.any(Number),
  });
  expect(duplicate.headers.get("Retry-After")).toBeTruthy();
  expect(calls).toBe(2);
});
it("blocks concurrent identical requests and distinguishes actual pending work from successful cooldown", async () => {
  const { env } = setup();
  let finish!: (v: ReturnType<typeof analysisFixture>) => void;
  const analyze = vi.fn(
    () =>
      new Promise<ReturnType<typeof analysisFixture>>((resolve) => {
        finish = resolve;
      }),
  );
  const running = handleAnalysis(req(), env, { analyze });
  await vi.waitFor(() => expect(analyze).toHaveBeenCalledOnce());
  const duplicate = await handleAnalysis(req(), env, { analyze });
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({
    code: "ANALYSIS_IN_PROGRESS",
  });
  finish(analysisFixture());
  expect((await running).status).toBe(200);
});
it("invalid structured output is an actual failure, not a successful cooldown", async () => {
  const { env } = setup();
  const invalid = await handleAnalysis(req(), env, {
    analyze: async () => ({}) as ReturnType<typeof analysisFixture>,
  });
  expect(await invalid.json()).toMatchObject({
    code: "ANALYSIS_INVALID_OUTPUT",
  });
  expect(
    (
      await handleAnalysis(req(), env, {
        analyze: async () => analysisFixture(),
      })
    ).status,
  ).toBe(200);
});
it("cancelled requests release protection and ignore late results even if a provider ignores abort", async () => {
  const { env } = setup(),
    controller = new AbortController();
  let finish!: (v: ReturnType<typeof analysisFixture>) => void;
  const analyze = vi.fn(
    () =>
      new Promise<ReturnType<typeof analysisFixture>>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = handleAnalysis(req(controller.signal), env, { analyze });
  await vi.waitFor(() => expect(analyze).toHaveBeenCalledOnce());
  controller.abort();
  const response = await pending;
  expect(await response.json()).toMatchObject({ code: "ANALYSIS_INTERRUPTED" });
  expect(
    (
      await handleAnalysis(req(), env, {
        analyze: async () => analysisFixture(),
      })
    ).status,
  ).toBe(200);
  finish(analysisFixture());
  const again = await handleAnalysis(req(), env, {
    analyze: async () => analysisFixture(),
  });
  expect(await again.json()).toMatchObject({ code: "ANALYSIS_COOLDOWN" });
});
it("bounds a stuck provider, releases its lease and ignores its late completion", async () => {
  vi.useFakeTimers();
  const { env } = setup();
  let finish!: (v: ReturnType<typeof analysisFixture>) => void;
  const analyze = vi.fn(
    () =>
      new Promise<ReturnType<typeof analysisFixture>>((resolve) => {
        finish = resolve;
      }),
  );
  const pending = handleAnalysis(req(), env, { analyze });
  await vi.waitFor(() => expect(analyze).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(90001);
  expect(await (await pending).json()).toMatchObject({
    code: "ANALYSIS_TIMEOUT",
  });
  expect(
    (
      await handleAnalysis(req(), env, {
        analyze: async () => analysisFixture(),
      })
    ).status,
  ).toBe(200);
  finish(analysisFixture());
});
it("stale timestamped pending records can be recovered, but legacy markers retain their original guard", async () => {
  const { kv, values } = setup();
  values.set(
    "request:test",
    JSON.stringify({
      phase: "pending",
      owner: "abandoned",
      expires: Date.now() - 1,
    }),
  );
  const lease = await reserveAnalysis(kv, "request:test", "daily:test");
  expect(lease.state.owner).not.toBe("abandoned");
  values.set("request:legacy", "in-progress");
  await expect(
    reserveAnalysis(kv, "request:legacy", "daily:test"),
  ).rejects.toMatchObject({ code: "ANALYSIS_IN_PROGRESS" });
});
it("late cleanup never overwrites a newer request's lease", async () => {
  const { kv, values } = setup();
  const lease = await reserveAnalysis(kv, "request:test", "daily:test");
  const newer = JSON.stringify({
    phase: "pending",
    owner: "newer-request",
    expires: Date.now() + 120000,
  });
  values.set("request:test", newer);
  await finishAnalysis(lease, "failed");
  expect(values.get("request:test")).toBe(newer);
});
it("storage failure fails closed and failure cleanup never masks the real provider reason", async () => {
  const { env, kv } = setup();
  kv.get.mockRejectedValueOnce(new Error("PRIVATE_KV_DETAIL"));
  const analyze = vi.fn(async () => analysisFixture());
  const failed = await handleAnalysis(req(), env, { analyze });
  expect(await failed.json()).toMatchObject({
    code: "ANALYSIS_TRACKING_UNAVAILABLE",
  });
  expect(analyze).not.toHaveBeenCalled();
  const { env: other, kv: otherKv } = setup();
  const response = await handleAnalysis(req(), other, {
    analyze: async () => {
      otherKv.put.mockRejectedValue(new Error("PRIVATE_KV_DETAIL"));
      throw new AnalysisFailure("ANALYSIS_OUTPUT_LIMIT");
    },
  });
  const body = (await response.json()) as { error: string; code: string };
  expect(body.code).toBe("ANALYSIS_OUTPUT_LIMIT");
  expect(body.error).toContain("tracking could not be cleared");
  expect(body.error).not.toContain("PRIVATE_KV_DETAIL");
});
it("failed attempts still consume the daily limit", async () => {
  const { env, values } = setup();
  const provider = {
    analyze: async () => {
      throw new AnalysisFailure("ANALYSIS_PROVIDER_BUSY");
    },
  };
  for (let i = 0; i < 20; i++)
    expect((await handleAnalysis(req(), env, provider)).status).toBe(503);
  const capped = await handleAnalysis(req(), env, provider);
  expect(capped.status).toBe(429);
  expect(await capped.json()).toMatchObject({ code: "ANALYSIS_DAILY_LIMIT" });
  expect([...values].find(([k]) => k.startsWith("daily:"))?.[1]).toBe("20");
});
it.each([
  [401, "invalid_api_key", "ANALYSIS_PROVIDER_AUTH"],
  [429, "insufficient_quota", "ANALYSIS_PROVIDER_QUOTA"],
  [429, "rate_limit_exceeded", "ANALYSIS_PROVIDER_BUSY"],
  [400, "invalid_json_schema", "ANALYSIS_SCHEMA_REJECTED"],
  [400, "context_length_exceeded", "ANALYSIS_INPUT_LIMIT"],
  [503, "server_error", "ANALYSIS_PROVIDER_UNAVAILABLE"],
])(
  "provider HTTP %s gives an allowlisted reason without exposing raw details",
  async (status, code, expected) => {
    const provider = openAIProvider(
      "PRIVATE_TEST_PLACEHOLDER",
      undefined,
      async () =>
        Response.json(
          { error: { code, message: "PRIVATE_DRAWING_AND_KEY_DETAIL" } },
          { status: Number(status) },
        ),
    );
    const result = await handleAnalysis(
      req(),
      { DEV_ALLOW_LOCAL: "true" },
      provider,
    );
    const text = await result.text();
    expect(text).toContain(String(expected));
    expect(text).not.toContain("PRIVATE_DRAWING_AND_KEY_DETAIL");
    expect(text).not.toContain("PRIVATE_TEST_PLACEHOLDER");
  },
);
it.each([
  [
    {
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    },
    "ANALYSIS_OUTPUT_LIMIT",
  ],
  [
    {
      status: "completed",
      output: [
        { content: [{ type: "refusal", refusal: "PRIVATE_REFUSAL_TEXT" }] },
      ],
    },
    "ANALYSIS_REFUSED",
  ],
  [
    {
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: "PRIVATE_INVALID_JSON" }] },
      ],
    },
    "ANALYSIS_INVALID_OUTPUT",
  ],
])("classifies provider response completion safely", async (body, code) => {
  const response = await handleAnalysis(
    req(),
    { DEV_ALLOW_LOCAL: "true" },
    openAIProvider("TEST_PLACEHOLDER", undefined, async () =>
      Response.json(body),
    ),
  );
  const raw = await response.text();
  expect(raw).toContain(code);
  expect(raw).not.toContain("PRIVATE_");
});
it("same-isolate simultaneous requests cannot both pass asynchronous KV reads", async () => {
  const { env } = setup();
  let finish!: (v: ReturnType<typeof analysisFixture>) => void;
  const analyze = vi.fn(
    () =>
      new Promise<ReturnType<typeof analysisFixture>>((resolve) => {
        finish = resolve;
      }),
  );
  const one = handleAnalysis(req(), env, { analyze }),
    two = handleAnalysis(req(), env, { analyze });
  await vi.waitFor(() => expect(analyze).toHaveBeenCalledOnce());
  finish(analysisFixture());
  expect((await Promise.all([one, two])).map((r) => r.status).sort()).toEqual([
    200, 409,
  ]);
  expect(analyze).toHaveBeenCalledOnce();
});
it("a failed cleanup remains bounded and recovers after the owned pending timestamp expires", async () => {
  const { env, kv, values } = setup();
  const first = await handleAnalysis(req(), env, {
    analyze: async () => {
      kv.put.mockRejectedValue(new Error("PRIVATE_STORAGE_FAILURE"));
      throw new AnalysisFailure("ANALYSIS_PROVIDER_BUSY");
    },
  });
  expect(await first.json()).toMatchObject({ code: "ANALYSIS_PROVIDER_BUSY" });
  const blocked = await handleAnalysis(req(), env, {
    analyze: async () => analysisFixture(),
  });
  expect(await blocked.json()).toMatchObject({ code: "ANALYSIS_IN_PROGRESS" });
  kv.put.mockImplementation(async (k, v) => {
    values.set(k, v);
  });
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 121000);
  expect(
    (
      await handleAnalysis(req(), env, {
        analyze: async () => analysisFixture(),
      })
    ).status,
  ).toBe(200);
});
