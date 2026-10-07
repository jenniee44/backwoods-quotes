export type AccessEnv = {
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  DEV_ALLOW_LOCAL?: string;
};
let cached: { domain: string; expires: number; keys: JsonWebKey[] } | undefined;
const decode = (part: string) =>
  Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export async function authorize(
  request: Request,
  env: AccessEnv,
): Promise<string> {
  const host = new URL(request.url).hostname;
  if (
    env.DEV_ALLOW_LOCAL === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(host)
  )
    return "local-development";
  const domain = env.CF_ACCESS_TEAM_DOMAIN;
  if (
    !domain ||
    !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain) ||
    !env.CF_ACCESS_AUD
  )
    throw new Error("CONFIG_AUTH");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > 10000) throw new Error("AUTH");
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Date.now() / 1000;
    if (
      header.alg !== "RS256" ||
      claims.iss !== `https://${domain}` ||
      !Array.isArray(claims.aud) ||
      !claims.aud.includes(env.CF_ACCESS_AUD) ||
      typeof claims.exp !== "number" ||
      claims.exp <= now ||
      (claims.nbf && claims.nbf > now) ||
      typeof claims.sub !== "string"
    )
      throw new Error();
    if (!cached || cached.domain !== domain || cached.expires < Date.now()) {
      const response = await fetch(`https://${domain}/cdn-cgi/access/certs`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { keys: JsonWebKey[] };
      if (!Array.isArray(data.keys)) throw new Error();
      cached = { domain, expires: Date.now() + 300000, keys: data.keys };
    }
    const jwk = cached.keys.find(
      (k) =>
        (k as JsonWebKey & { kid?: string }).kid === header.kid &&
        k.kty === "RSA",
    );
    if (!jwk) throw new Error();
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      !(await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        decode(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      ))
    )
      throw new Error();
    return claims.sub;
  } catch {
    throw new Error("AUTH");
  }
}
