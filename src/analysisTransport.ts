import type { PlanAnalysisResult } from "../shared/analysis";
export type AnalysisTransport = {
  analysisId?: string;
  reused?: boolean;
  warning?: string;
  global: boolean;
  persistence: "confirmed" | "failed" | "unknown" | "browser";
};
const records = new WeakMap<PlanAnalysisResult, AnalysisTransport>();
export const analysisTransport = (
  result: PlanAnalysisResult,
): AnalysisTransport =>
  records.get(result) ?? { global: false, persistence: "unknown" };
export function markAnalysisTransport(
  result: PlanAnalysisResult,
  info: AnalysisTransport,
) {
  records.set(result, info);
  return result;
}
