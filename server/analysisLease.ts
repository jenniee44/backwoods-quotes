import { AnalysisFailure } from "../shared/analysisErrors";
export type AnalysisLimits = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options: { expirationTtl: number },
  ): Promise<void>;
};
type State = {
  phase: "pending" | "succeeded" | "failed";
  owner: string;
  expires: number;
};
// Isolate-local race protection, bounded metadata only; KV remains the cross-isolate guard.
const recent = new WeakMap<AnalysisLimits, Map<string, State>>();
function cache(kv: AnalysisLimits) {
  let map = recent.get(kv);
  if (!map) {
    map = new Map();
    recent.set(kv, map);
  }
  for (const [k, v] of map) if (v.expires <= Date.now()) map.delete(k);
  return map;
}
function state(raw: string | null): State | null {
  try {
    const s = JSON.parse(raw ?? "null");
    return s &&
      ["pending", "succeeded", "failed"].includes(s.phase) &&
      typeof s.owner === "string" &&
      typeof s.expires === "number" &&
      Number.isFinite(s.expires)
      ? s
      : null;
  } catch {
    return null;
  }
}
function block(s: State) {
  if (s.expires <= Date.now() || s.phase === "failed") return;
  throw new AnalysisFailure(
    s.phase === "pending" ? "ANALYSIS_IN_PROGRESS" : "ANALYSIS_COOLDOWN",
    Math.max(1, Math.ceil((s.expires - Date.now()) / 1000)),
  );
}
export type AnalysisLease = { kv: AnalysisLimits; key: string; state: State };
export async function reserveAnalysis(
  kv: AnalysisLimits,
  key: string,
  daily: string,
): Promise<AnalysisLease> {
  const map = cache(kv);
  const local = map.get(key);
  if (local) block(local);
  const raw = await kv.get(key),
    stored = state(raw);
  // Prefer a known terminal state to a stale read of our own pending KV write.
  if (stored && !(local?.owner === stored.owner && local.phase === "failed"))
    block(stored);
  else if (raw && !stored)
    throw new AnalysisFailure("ANALYSIS_IN_PROGRESS", 120); // legacy marker expires via its original TTL
  const rawCount = await kv.get(daily),
    count = rawCount === null ? 0 : Number(rawCount);
  if (!Number.isInteger(count) || count < 0)
    throw new AnalysisFailure("ANALYSIS_TRACKING_UNAVAILABLE");
  if (count >= 20) throw new AnalysisFailure("ANALYSIS_DAILY_LIMIT");
  // Recheck after async reads so simultaneous requests in this isolate cannot both proceed.
  const active = map.get(key);
  if (active) block(active);
  if (map.size >= 1000 && !map.has(key))
    throw new AnalysisFailure("ANALYSIS_TRACKING_UNAVAILABLE");
  const next: State = {
    phase: "pending",
    owner: crypto.randomUUID(),
    expires: Date.now() + 120000,
  };
  map.set(key, next);
  try {
    await kv.put(daily, String(count + 1), { expirationTtl: 172800 });
    await kv.put(key, JSON.stringify(next), { expirationTtl: 120 });
  } catch {
    if (map.get(key)?.owner === next.owner) map.delete(key);
    throw new AnalysisFailure("ANALYSIS_TRACKING_UNAVAILABLE");
  }
  return { kv, key, state: next };
}
export async function finishAnalysis(
  lease: AnalysisLease,
  phase: "failed" | "succeeded",
) {
  const { kv, key, state: owned } = lease;
  const map = cache(kv);
  if (map.get(key)?.owner !== owned.owner) return;
  const stored = state(await kv.get(key));
  if (stored && stored.owner !== owned.owner) return; // never clear a newer request
  const ttl = phase === "failed" ? 60 : 120;
  const next: State = {
    phase,
    owner: owned.owner,
    expires: Date.now() + ttl * 1000,
  };
  await kv.put(key, JSON.stringify(next), { expirationTtl: ttl });
  map.set(key, next);
}
