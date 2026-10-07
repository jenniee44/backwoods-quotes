import { it, expect, vi, afterEach } from "vitest";
import { handleAnalysis } from "./handler";
import { openAIProvider } from "./provider";
import { authorize } from "./access";
import { analysisFixture } from "../shared/analysis.fixture";
const document = {
  id: "plan",
  name: "private-homeowner.pdf",
  type: "application/pdf",
  data: "data:application/pdf;base64," + btoa("%PDF-1.7\nfixture\n%%EOF"),
};
const req = (
  body: unknown = { documents: [document] },
  url = "http://127.0.0.1:8788/api/plan-analysis",
) =>
  new Request(url, {
    method: "POST",
    headers: {
      Origin: new URL(url).origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
afterEach(() => vi.unstubAllGlobals());
it("fails closed without Access configuration and never contacts AI", async () => {
  const analyze = vi.fn();
  const r = await handleAnalysis(
    req(undefined, "https://quotes.example/api/plan-analysis"),
    { DEV_ALLOW_LOCAL: "true" },
    { analyze },
  );
  expect(r.status).toBe(503);
  expect(analyze).not.toHaveBeenCalled();
});
it("requires server key locally and returns helpful configuration error", async () => {
  const r = await handleAnalysis(req(), { DEV_ALLOW_LOCAL: "true" });
  expect(r.status).toBe(503);
  expect(await r.text()).toContain("OPENAI_API_KEY");
});
it("rejects CSRF and unsupported methods", async () => {
  expect(
    (
      await handleAnalysis(
        new Request("https://quotes.example/api/plan-analysis", {
          method: "POST",
          headers: { Origin: "https://other.example" },
        }),
        {},
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await handleAnalysis(
        new Request("https://quotes.example/api/plan-analysis"),
        {},
      )
    ).status,
  ).toBe(405);
});
it("rejects corrupt files without calling provider", async () => {
  const analyze = vi.fn();
  const r = await handleAnalysis(
    req({ documents: [{ ...document, data: "bad" }] }),
    { DEV_ALLOW_LOCAL: "true" },
    { analyze },
  );
  expect(r.status).toBe(400);
  expect(analyze).not.toHaveBeenCalled();
});
it("calls provider through the secured route and returns structured results only", async () => {
  const r = await handleAnalysis(
    req(),
    { DEV_ALLOW_LOCAL: "true" },
    { analyze: async () => analysisFixture() },
  );
  expect(r.status).toBe(200);
  expect(r.headers.get("Cache-Control")).toBe("no-store");
  expect(
    ((await r.json()) as { suggestions: unknown[] }).suggestions,
  ).toHaveLength(2);
});
it("limits requests and duplicate calls without storing plan content in KV", async () => {
  const values = new Map<string, string>();
  const put = vi.fn(async (k: string, v: string) => {
    values.set(k, v);
  });
  const env = {
    DEV_ALLOW_LOCAL: "true",
    ANALYSIS_LIMITS: { get: async (k: string) => values.get(k) ?? null, put },
  };
  const provider = { analyze: async () => analysisFixture() };
  expect((await handleAnalysis(req(), env, provider)).status).toBe(200);
  expect((await handleAnalysis(req(), env, provider)).status).toBe(409);
  expect(JSON.stringify(put.mock.calls)).not.toContain("fixture");
  expect(JSON.stringify(put.mock.calls)).not.toContain("homeowner");
});
it("API failure is generic and cannot disclose provider keys/responses", async () => {
  const r = await handleAnalysis(
    req(),
    { DEV_ALLOW_LOCAL: "true" },
    {
      analyze: async () => {
        throw new Error("secret-provider-key");
      },
    },
  );
  expect(r.status).toBe(502);
  expect(await r.text()).not.toContain("secret-provider-key");
});
it("verifies Access RSA signature, audience and expiry", async () => {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: "test-key" }] })),
  );
  const encode = (v: unknown) =>
    btoa(JSON.stringify(v))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const env = {
    CF_ACCESS_TEAM_DOMAIN: "testteam.cloudflareaccess.com",
    CF_ACCESS_AUD: "correct-aud",
  };
  const claims = {
    iss: "https://testteam.cloudflareaccess.com",
    aud: ["correct-aud"],
    sub: "authorized-user",
    exp: Date.now() / 1000 + 300,
  };
  const prefix =
    encode({ alg: "RS256", kid: "test-key" }) + "." + encode(claims);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(prefix),
  );
  const token =
    prefix +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const request = new Request("https://quotes.example/api/plan-analysis", {
    headers: { "Cf-Access-Jwt-Assertion": token },
  });
  expect(await authorize(request, env)).toBe("authorized-user");
  await expect(
    authorize(request, { ...env, CF_ACCESS_AUD: "wrong-aud" }),
  ).rejects.toThrow("AUTH");
  await expect(
    authorize(
      new Request(request.url, {
        headers: { "Cf-Access-Jwt-Assertion": token.slice(0, -5) + "wrong" },
      }),
      env,
    ),
  ).rejects.toThrow("AUTH");
});
it.each([
  [undefined, "gpt-5.4-mini"],
  ["custom-compatible-model", "custom-compatible-model"],
])(
  "provider uses model %s and preserves file/privacy/schema controls",
  async (model, expectedModel) => {
    let payload: Record<string, unknown> = {};
    const mock = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({
        status: "completed",
        output: [
          {
            content: [
              { type: "output_text", text: JSON.stringify(analysisFixture()) },
            ],
          },
        ],
      });
    });
    const result = await openAIProvider(
      "test-server-secret",
      model,
      mock as typeof fetch,
    ).analyze([document], new AbortController().signal);
    expect(result.suggestions).toHaveLength(2);
    expect(payload.model).toBe(expectedModel);
    expect(payload.store).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("homeowner");
    expect(JSON.stringify(payload)).not.toContain("test-server-secret");
    expect(
      (payload.text as { format: { strict: boolean } }).format.strict,
    ).toBe(true);
  },
);
it("provider rejects invalid JSON, refusal, truncation and API errors", async () => {
  for (const response of [
    Response.json({ status: "incomplete" }),
    Response.json({
      status: "completed",
      output: [{ content: [{ type: "refusal", refusal: "no" }] }],
    }),
    Response.json({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: "invalid JSON" }] }],
    }),
    new Response("provider error", { status: 429 }),
  ])
    await expect(
      openAIProvider("test", "gpt-5.4-mini", async () => response).analyze(
        [document],
        new AbortController().signal,
      ),
    ).rejects.toThrow();
});

it("provider prioritizes contractor takeoff with supported calculations and preserves the secured schema", async () => {
  let payload: Record<string, unknown> = {};
  const fixture = analysisFixture();
  Object.assign(fixture.suggestions[1], {
    calculationBasis: "6 supports counted once",
    sourceFacts: ["Six distinct joists on page 1"],
    quantityMethod: "Counted",
    classification: "Calculated quantity",
  });
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
  const response = await handleAnalysis(
    req(),
    { DEV_ALLOW_LOCAL: "true" },
    provider,
  );
  expect(response.status).toBe(200);
  expect(payload.model).toBe("gpt-5.4-mini");
  const instructions = String(payload.instructions);
  for (const phrase of [
    "Produce a contractor estimating takeoff",
    "joist size",
    "footing/pier",
    "DO NOT SCALE",
    "NEVER invent",
    "contractor enters all labour hours",
    "NOT automatically subcontracted",
    "sourceFacts",
    "calculationBasis",
    "untrusted data",
    "No customer quote text",
  ])
    expect(instructions).toContain(phrase);
  expect(instructions).not.toMatch(/9 visible|9 concrete|2 elevation/);
  const format = (
    payload.text as {
      format: {
        strict: boolean;
        schema: { properties: Record<string, unknown> };
      };
    }
  ).format;
  expect(format.strict).toBe(true);
  expect(format.schema.properties).toHaveProperty("summary");
  expect(await response.json()).toMatchObject({
    suggestions: [
      { quantity: null },
      { quantity: 6, sourceFacts: ["Six distinct joists on page 1"] },
    ],
  });
});

it("sends the unchanged native PDF plus untrusted selectable text and separate 250 DPI detail, never a preview thumbnail", async () => {
  const pixels = new Uint8Array(24);
  pixels.set([137, 80, 78, 71, 13, 10, 26, 10]);
  pixels.set([73, 72, 68, 82], 12);
  new DataView(pixels.buffer).setUint32(16, 500);
  new DataView(pixels.buffer).setUint32(20, 500);
  const image = "data:image/png;base64," + btoa(String.fromCharCode(...pixels));
  const source = {
    ...document,
    pdfText: {
      pageCount: 1,
      truncated: false,
      pages: [
        {
          page: 1,
          width: 2592,
          height: 1728,
          text: 'JOISTS 2x8 PT @ 16" O/C',
          status: "Available" as const,
        },
      ],
    },
    detailRegions: [
      {
        page: 1,
        x: 30,
        y: 30,
        width: 144,
        height: 144,
        pageWidth: 2592,
        pageHeight: 1728,
        dpi: 250,
        pixelWidth: 500,
        pixelHeight: 500,
        data: image,
      },
    ],
  };
  let payload: Record<string, unknown> = {};
  const provider = openAIProvider(
    "test-only-placeholder",
    undefined,
    async (_url, init) => {
      payload = JSON.parse(String(init?.body));
      return Response.json({
        status: "completed",
        output: [
          {
            content: [
              { type: "output_text", text: JSON.stringify(analysisFixture()) },
            ],
          },
        ],
      });
    },
  );
  const response = await handleAnalysis(
    req({ documents: [source] }),
    { DEV_ALLOW_LOCAL: "true" },
    provider,
  );
  expect(response.status).toBe(200);
  const inputs = (payload.input as { content: Record<string, unknown>[] }[])[0]
    .content;
  expect(inputs.find((input) => input.type === "input_file")).toMatchObject({
    file_data: document.data,
    filename: "plan-1.pdf",
  });
  expect(inputs.find((input) => input.type === "input_image")).toMatchObject({
    image_url: image,
    detail: "high",
  });
  const strings = JSON.stringify(inputs);
  expect(strings).toContain("untrustedEmbeddedPdfText");
  expect(strings).toContain("JOISTS 2x8 PT");
  expect(strings).toContain(
    "250 DPI detail rendered directly from original PDF",
  );
  expect(strings).not.toContain("private-homeowner");
  expect(payload.model).toBe("gpt-5.4-mini");
});
it("rejects low-resolution detail input before calling the secured provider", async () => {
  const analyze = vi.fn();
  const response = await handleAnalysis(
    req({ documents: [{ ...document, detailRegions: [{ dpi: 72 }] }] }),
    { DEV_ALLOW_LOCAL: "true" },
    { analyze },
  );
  expect(response.status).toBe(400);
  expect(analyze).not.toHaveBeenCalled();
});
