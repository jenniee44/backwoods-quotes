import { afterEach, expect, it, vi } from "vitest";
import {
  recoverSavedAnalysis,
  RecoveryFailure,
  recoveryHeading,
} from "./analysisRecovery";
import { analysisFixture } from "../shared/analysis.fixture";
import { sourceDigest, digest } from "../shared/analysisRecovery";
import { analysisTransport } from "./analysisTransport";
import { planAnalysisService } from "./planAnalysis";
const documents = [
  {
    id: "plan",
    name: "Synthetic.pdf",
    type: "application/pdf",
    data: "data:application/pdf;base64," + btoa("%PDF-1.7\nsynthetic\n%%EOF"),
  },
];
afterEach(() => vi.unstubAllGlobals());
it("recovers an entire job with source/quote identity and no document bytes or paid action", async () => {
  const analysisId = await digest("job"),
    fetcher = vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        action: "recover",
        quoteId: "quote-a",
        sourceDigest: await sourceDigest(documents),
      });
      expect(init.body).not.toContain("base64");
      return Response.json({
        state: "completed",
        analysisId,
        persistence: "confirmed",
        batches: [analysisFixture()],
      });
    });
  vi.stubGlobal("fetch", fetcher);
  const result = await recoverSavedAnalysis(
    documents,
    "quote-a",
    new AbortController().signal,
  );
  expect(result.suggestions.length).toBeGreaterThan(0);
  expect(analysisTransport(result)).toMatchObject({
    global: true,
    persistence: "confirmed",
    analysisId,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
for (const state of [
  "missing",
  "running",
  "interrupted",
  "storage-unavailable",
  "failed",
] as const)
  it(`reports ${state} without treating it as a new paid AI failure`, async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            state,
            code: state === "failed" ? "ANALYSIS_PROVIDER_QUOTA" : undefined,
          },
          { status: state === "running" ? 202 : 404 },
        ),
      ),
    );
    try {
      await recoverSavedAnalysis(
        documents,
        "quote-a",
        new AbortController().signal,
      );
      throw new Error("Expected recovery status");
    } catch (e) {
      expect(e).toBeInstanceOf(RecoveryFailure);
      expect((e as RecoveryFailure).state).toBe(state);
      expect(recoveryHeading(e as RecoveryFailure)).not.toBe("Analysis failed");
    }
  });
it("network/auth response failures are distinct from missing results and KV binding failures", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("private transport detail");
    }),
  );
  await expect(
    recoverSavedAnalysis(documents, "quote-a", new AbortController().signal),
  ).rejects.toMatchObject({ state: "service-unavailable" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Access login", { status: 401 })),
  );
  await expect(
    recoverSavedAnalysis(documents, "quote-a", new AbortController().signal),
  ).rejects.toMatchObject({ state: "service-unavailable" });
});
it("rejects corrupted or cross-source saved output without another fetch", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({
      state: "completed",
      persistence: "confirmed",
      batches: [analysisFixture("another-source")],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    recoverSavedAnalysis(documents, "quote-a", new AbortController().signal),
  ).rejects.toMatchObject({ state: "failed" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("paid requests carry a stable batch identity and distinguish unconfirmed persistence", async () => {
  const analysis = {
    quoteId: "quote-a",
    analysisId: await digest("job"),
    batchIndex: 0,
    batchCount: 1,
    indices: {},
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      expect(JSON.parse(init.body).analysis).toEqual(analysis);
      return Response.json({
        state: "completed",
        analysisId: analysis.analysisId,
        persistence: "failed",
        result: analysisFixture(),
      });
    }),
  );
  const result = await planAnalysisService.analyze(
    documents,
    new AbortController().signal,
    analysis,
  );
  expect(analysisTransport(result)).toMatchObject({
    global: true,
    persistence: "failed",
  });
  expect(analysisTransport(result).warning).toContain("not confirmed");
});
