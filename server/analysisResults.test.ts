import { expect, it, vi } from "vitest";
import { handleAnalysis, type Env } from "./handler";
import { analysisFixture } from "../shared/analysis.fixture";
import { digest, sourceDigest } from "../shared/analysisRecovery";
import { AnalysisFailure } from "../shared/analysisErrors";
const doc = {
  id: "plan",
  name: "Synthetic.pdf",
  type: "application/pdf",
  data: "data:application/pdf;base64," + btoa("%PDF-1.7 SYNTHETIC_ONLY %%EOF"),
};
const quote = "quote-a";
const request = (body: unknown, signal?: AbortSignal) =>
  new Request("http://localhost/api/plan-analysis", {
    method: "POST",
    headers: { Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
async function setup() {
  const values = new Map<string, string>(),
    limits = new Map<string, string>();
  const kv = {
    get: vi.fn(async (k: string) => values.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => {
      values.set(k, v);
    }),
  };
  const limit = {
    get: async (k: string) => limits.get(k) ?? null,
    put: async (k: string, v: string) => {
      limits.set(k, v);
    },
  };
  const env: Env = {
    DEV_ALLOW_LOCAL: "true",
    ANALYSIS_RESULTS: kv,
    ANALYSIS_LIMITS: limit,
  };
  const analysis = {
    analysisId: await digest("stable-source-settings"),
    quoteId: quote,
    batchIndex: 0,
    batchCount: 1,
    indices: {},
  };
  const body = { documents: [doc], analysis };
  const recover = {
    action: "recover",
    quoteId: quote,
    sourceDigest: await sourceDigest([doc]),
  };
  return { env, kv, values, limits, body, recover };
}
it("confirms completed batches in private storage before responding, then recovers after a new request without AI or a provider key", async () => {
  const s = await setup(),
    provider = { analyze: vi.fn(async () => analysisFixture()) };
  const first = await handleAnalysis(request(s.body), s.env, provider);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({
    state: "completed",
    persistence: "confirmed",
    analysisId: s.body.analysis.analysisId,
  });
  expect([...s.values.keys()].some((k) => k.endsWith(":result"))).toBe(true);
  const recovered = await handleAnalysis(request(s.recover), s.env);
  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toMatchObject({
    state: "completed",
    persistence: "confirmed",
    completedBatches: 1,
    totalBatches: 1,
  });
  expect(provider.analyze).toHaveBeenCalledTimes(1);
  expect([...s.limits.values()].filter((v) => v === "1")).toHaveLength(1);
  expect([...s.values.values()].join("")).not.toContain("SYNTHETIC_ONLY");
  expect([...s.values.values()].join("")).not.toContain("Synthetic.pdf");
});
it("identical paid POSTs reuse the saved result without another charge", async () => {
  const s = await setup(),
    provider = { analyze: vi.fn(async () => analysisFixture()) };
  await handleAnalysis(request(s.body), s.env, provider);
  const again = await handleAnalysis(request(s.body), s.env, provider);
  expect(await again.json()).toMatchObject({ persistence: "confirmed" });
  expect(provider.analyze).toHaveBeenCalledTimes(1);
});
it("missing results are not AI failure and recovery never calls the provider or consumes rate limits", async () => {
  const s = await setup(),
    provider = { analyze: vi.fn() };
  const response = await handleAnalysis(request(s.recover), s.env, provider);
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({
    state: "missing",
    code: "ANALYSIS_RESULT_MISSING",
  });
  expect(provider.analyze).not.toHaveBeenCalled();
  expect(s.limits.size).toBe(0);
});
it("fails closed before paid work if result storage is missing or cannot prepare writes", async () => {
  const s = await setup(),
    provider = { analyze: vi.fn() };
  expect(
    (
      await handleAnalysis(
        request(s.body),
        { ...s.env, ANALYSIS_RESULTS: undefined },
        provider,
      )
    ).status,
  ).toBe(503);
  s.kv.put.mockRejectedValue(
    new Error("private credential provider-body should never appear"),
  );
  const response = await handleAnalysis(request(s.body), s.env, provider);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private credential");
  expect(provider.analyze).not.toHaveBeenCalled();
});
it("returns completed results truthfully if result persistence fails, and records a storage failure for free recovery", async () => {
  const s = await setup();
  s.kv.put.mockImplementation(async (k, v) => {
    if (k.endsWith(":result")) throw new Error("secret");
    s.values.set(k, v);
  });
  const provider = { analyze: vi.fn(async () => analysisFixture()) };
  const response = await handleAnalysis(request(s.body), s.env, provider);
  expect(await response.json()).toMatchObject({
    state: "completed",
    persistence: "failed",
    result: { suggestions: expect.any(Array) },
  });
  const recovery = await handleAnalysis(request(s.recover), s.env, provider);
  expect(await recovery.json()).toMatchObject({
    state: "failed",
    code: "ANALYSIS_PERSISTENCE_FAILED",
  });
  expect(provider.analyze).toHaveBeenCalledTimes(1);
});
it("does not discard a persisted successful result when rate-limit cleanup fails", async () => {
  const s = await setup(),
    base = s.env.ANALYSIS_LIMITS!;
  s.env.ANALYSIS_LIMITS = {
    ...base,
    put: async (k, v, o) => {
      if (v.includes('"phase":"succeeded"')) throw new Error("tracking outage");
      await base.put(k, v, o);
    },
  };
  const response = await handleAnalysis(request(s.body), s.env, {
    analyze: async () => analysisFixture(),
  });
  expect(await response.json()).toMatchObject({
    state: "completed",
    persistence: "confirmed",
    trackingWarning: expect.any(String),
  });
  expect((await handleAnalysis(request(s.recover), s.env)).status).toBe(200);
});
it("a disconnected browser does not cancel approved provider work; free recovery reports running then completed", async () => {
  const s = await setup();
  let complete!: (r: ReturnType<typeof analysisFixture>) => void;
  const provider = {
    analyze: vi.fn(
      () =>
        new Promise<ReturnType<typeof analysisFixture>>((resolve) => {
          complete = resolve;
        }),
    ),
  };
  const controller = new AbortController(),
    background: Promise<unknown>[] = [];
  const pending = handleAnalysis(
    request(s.body, controller.signal),
    s.env,
    provider,
    (p) => background.push(p),
  );
  await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1));
  controller.abort();
  const running = await handleAnalysis(request(s.recover), s.env, provider);
  expect(running.status).toBe(202);
  expect(await running.json()).toMatchObject({ state: "running" });
  complete(analysisFixture());
  expect((await pending).status).toBe(200);
  await Promise.all(background);
  expect((await handleAnalysis(request(s.recover), s.env)).status).toBe(200);
  expect(provider.analyze).toHaveBeenCalledTimes(1);
});
it("preserves actual provider failures separately from missing or unavailable storage", async () => {
  const s = await setup(),
    provider = {
      analyze: async () => {
        throw new AnalysisFailure("ANALYSIS_PROVIDER_QUOTA");
      },
    };
  await handleAnalysis(request(s.body), s.env, provider);
  expect(
    await (await handleAnalysis(request(s.recover), s.env)).json(),
  ).toMatchObject({ state: "failed", code: "ANALYSIS_PROVIDER_QUOTA" });
  s.kv.get.mockRejectedValue(new Error("secret"));
  expect(
    await (await handleAnalysis(request(s.recover), s.env)).json(),
  ).toMatchObject({ state: "storage-unavailable" });
});
it("isolates results by quote, exact original source and authenticated principal", async () => {
  const s = await setup();
  await handleAnalysis(request(s.body), s.env, {
    analyze: async () => analysisFixture(),
  });
  expect(
    (
      await handleAnalysis(
        request({ ...s.recover, quoteId: "other-quote" }),
        s.env,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await handleAnalysis(
        request({
          ...s.recover,
          sourceDigest: await digest("different-source"),
        }),
        s.env,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await handleAnalysis(
        new Request("https://quotes.example/api/plan-analysis", {
          method: "POST",
          headers: {
            Origin: "https://quotes.example",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(s.recover),
        }),
        s.env,
      )
    ).status,
  ).toBe(503);
});
it("combines all completed batches without rerunning the provider", async () => {
  const s = await setup(),
    provider = { analyze: vi.fn(async () => analysisFixture()) };
  await handleAnalysis(
    request({ ...s.body, analysis: { ...s.body.analysis, batchCount: 2 } }),
    s.env,
    provider,
  );
  expect(
    await (await handleAnalysis(request(s.recover), s.env)).json(),
  ).toMatchObject({ state: "missing", completedBatches: 1, totalBatches: 2 });
  await handleAnalysis(
    request({
      ...s.body,
      analysis: { ...s.body.analysis, batchIndex: 1, batchCount: 2 },
    }),
    s.env,
    provider,
  );
  expect(
    await (await handleAnalysis(request(s.recover), s.env)).json(),
  ).toMatchObject({ state: "completed", completedBatches: 2, totalBatches: 2 });
  expect(provider.analyze).toHaveBeenCalledTimes(2);
});
it("a missing Preview binding is a storage configuration issue even when recovery has no OpenAI key", async () => {
  const s = await setup();
  const response = await handleAnalysis(request(s.recover), {
    ...s.env,
    ANALYSIS_RESULTS: undefined,
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    state: "storage-unavailable",
    code: "ANALYSIS_RESULTS_UNAVAILABLE",
  });
});
it("expired running requests remain interrupted/uncertain and are never automatically resent", async () => {
  const s = await setup();
  let finish!: (r: ReturnType<typeof analysisFixture>) => void;
  const provider = {
    analyze: vi.fn(
      () =>
        new Promise<ReturnType<typeof analysisFixture>>((r) => {
          finish = r;
        }),
    ),
  };
  const pending = handleAnalysis(request(s.body), s.env, provider);
  await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1));
  const key = [...s.values.keys()].find((k) => k.endsWith(":state"))!;
  s.values.set(
    key,
    JSON.stringify({ phase: "running", started: Date.now() - 140000 }),
  );
  expect(
    await (await handleAnalysis(request(s.recover), s.env, provider)).json(),
  ).toMatchObject({ state: "interrupted", code: "ANALYSIS_INTERRUPTED" });
  expect(provider.analyze).toHaveBeenCalledTimes(1);
  finish(analysisFixture());
  await pending;
});
it("concurrent attempts retain duplicate protection and do not spend twice", async () => {
  const s = await setup();
  let finish!: (r: ReturnType<typeof analysisFixture>) => void;
  const provider = {
    analyze: vi.fn(
      () =>
        new Promise<ReturnType<typeof analysisFixture>>((r) => {
          finish = r;
        }),
    ),
  };
  const pending = handleAnalysis(request(s.body), s.env, provider);
  await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1));
  const duplicate = await handleAnalysis(request(s.body), s.env, provider);
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({
    code: "ANALYSIS_IN_PROGRESS",
  });
  expect(provider.analyze).toHaveBeenCalledTimes(1);
  finish(analysisFixture());
  await pending;
});
it("retains global detail provenance across separate paid batches and a free recovery", async () => {
  const s = await setup();
  const header = new Uint8Array(24);
  header.set([137, 80, 78, 71, 13, 10, 26, 10]);
  header.set([73, 72, 68, 82], 12);
  new DataView(header.buffer).setUint32(16, 500);
  new DataView(header.buffer).setUint32(20, 500);
  const region = {
    page: 1,
    x: 0,
    y: 0,
    width: 144,
    height: 144,
    pageWidth: 900,
    pageHeight: 700,
    rotation: 0 as const,
    dpi: 250,
    pixelWidth: 500,
    pixelHeight: 500,
    data: "data:image/png;base64," + btoa(String.fromCharCode(...header)),
  };
  for (const [batchIndex, globalIndex] of [
    [0, 1],
    [1, 5],
  ]) {
    const result = analysisFixture();
    result.dimensions = [];
    result.sourceObservations = [];
    result.suggestions = [{ ...result.suggestions[1], sourceDetailView: 1 }];
    const response = await handleAnalysis(
      request({
        documents: [{ ...doc, detailRegions: [region] }],
        analysis: {
          ...s.body.analysis,
          batchIndex,
          batchCount: 2,
          indices: { plan: [globalIndex] },
        },
      }),
      s.env,
      { analyze: async () => result },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { suggestions: [{ sourceDetailView: globalIndex }] },
    });
  }
  const recovered = (await (
    await handleAnalysis(request(s.recover), s.env)
  ).json()) as { batches: ReturnType<typeof analysisFixture>[] };
  expect(
    recovered.batches.map((r) => r.suggestions[0].sourceDetailView),
  ).toEqual([1, 5]);
  expect(recovered.batches[1].suggestions[0].sourceFacts?.join()).toContain(
    "detail 5",
  );
});
