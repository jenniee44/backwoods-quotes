import { afterEach, expect, it, vi } from "vitest";
import { planAnalysisService } from "./planAnalysis";
import { analysisFixture } from "../shared/analysis.fixture";
const docs = [
  {
    id: "plan",
    name: "Synthetic.pdf",
    type: "application/pdf",
    data: "data:application/pdf;base64," + btoa("%PDF-1.7\n%%EOF"),
  },
];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("a stalled fetch times out, aborts its signal and permits a later request", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_url: unknown, init?: RequestInit) => {
    signal = init?.signal as AbortSignal;
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal("fetch", fetcher);
  const pending = planAnalysisService.analyze(docs);
  const check = expect(pending).rejects.toMatchObject({
    code: "ANALYSIS_CLIENT_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(120001);
  await check;
  expect(signal?.aborted).toBe(true);
  fetcher.mockImplementation(async () => Response.json(analysisFixture()));
  expect((await planAnalysisService.analyze(docs)).suggestions).toHaveLength(2);
});
it("body reading is bounded too, not just receipt of response headers", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start() {
              /* intentionally stalled */
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
  const pending = planAnalysisService.analyze(docs);
  const check = expect(pending).rejects.toMatchObject({
    code: "ANALYSIS_CLIENT_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(120001);
  await check;
});
it("user cancellation settles promptly even when the transport ignores abort", async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>(() => {})),
  );
  const pending = planAnalysisService.analyze(docs, controller.signal);
  const check = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await check;
});
it("preserves safe cooldown codes and bounded retry timing while ignoring untrusted extra text", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          code: "ANALYSIS_IN_PROGRESS",
          error: "PRIVATE_SERVER_DETAIL",
          retryAfterSeconds: 45,
        },
        { status: 409 },
      ),
    ),
  );
  await expect(planAnalysisService.analyze(docs)).rejects.toMatchObject({
    code: "ANALYSIS_IN_PROGRESS",
    retryAfterSeconds: 45,
  });
  try {
    await planAnalysisService.analyze(docs);
  } catch (e) {
    expect((e as Error).message).not.toContain("PRIVATE_SERVER_DETAIL");
  }
});
