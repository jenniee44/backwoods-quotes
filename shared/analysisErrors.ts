// Safe, finite error catalogue. Never forward provider bodies, keys or document text.
export const analysisErrors = {
  ANALYSIS_IN_PROGRESS: {
    status: 409,
    message:
      "An analysis of these same plans is still running. Wait for it to finish before retrying.",
  },
  ANALYSIS_COOLDOWN: {
    status: 409,
    message:
      "These plans were analyzed successfully recently. Review the existing results or wait before retrying.",
  },
  ANALYSIS_DAILY_LIMIT: {
    status: 429,
    message: "The daily plan-analysis limit was reached. Try tomorrow.",
  },
  ANALYSIS_TRACKING_UNAVAILABLE: {
    status: 503,
    message:
      "Analysis request tracking is temporarily unavailable. No new provider request can start safely. Try again later.",
  },
  ANALYSIS_PROVIDER_AUTH: {
    status: 503,
    message:
      "The analysis provider rejected the server credentials or model access. The owner must check the server-side provider setup.",
  },
  ANALYSIS_PROVIDER_MODEL: {
    status: 503,
    message:
      "The selected analysis model is unavailable to the provider account. The owner must check model access and the server-side model setting.",
  },
  ANALYSIS_SCHEMA_REJECTED: {
    status: 502,
    message:
      "The provider rejected the takeoff structured-output schema. A developer must review the schema; changing the drawing will not fix this error.",
  },
  ANALYSIS_PROVIDER_QUOTA: {
    status: 503,
    message:
      "The analysis provider account has no available usage allowance. The owner must check provider billing or usage limits.",
  },
  ANALYSIS_PROVIDER_BUSY: {
    status: 503,
    message:
      "The analysis provider is rate-limited or temporarily busy. Wait before retrying.",
  },
  ANALYSIS_PROVIDER_REQUEST: {
    status: 502,
    message:
      "The analysis provider rejected the request format or selected model. The owner must check the server-side provider setup.",
  },
  ANALYSIS_INPUT_LIMIT: {
    status: 502,
    message:
      "The analysis package exceeds the provider input limit. Select fewer documents or optional reading images; the original PDF has not been changed.",
  },
  ANALYSIS_OUTPUT_LIMIT: {
    status: 502,
    message:
      "The provider reached its response limit before completing the takeoff. Try fewer optional reading images or documents, or use manual takeoff. No partial results were added.",
  },
  ANALYSIS_INCOMPLETE: {
    status: 502,
    message:
      "The provider did not complete the analysis. No partial results were added. Retry or use manual takeoff.",
  },
  ANALYSIS_REFUSED: {
    status: 502,
    message:
      "The provider declined this analysis. No takeoff was added; use manual takeoff or review the source documents.",
  },
  ANALYSIS_INVALID_OUTPUT: {
    status: 502,
    message:
      "The provider returned a takeoff that failed validation. No partial results were added. Retry or use manual takeoff.",
  },
  ANALYSIS_PROVIDER_UNAVAILABLE: {
    status: 502,
    message:
      "The analysis provider is unavailable or could not be reached. Retry later; existing estimates are unchanged.",
  },
  ANALYSIS_TIMEOUT: {
    status: 504,
    message:
      "The server stopped the analysis after its time limit. Existing estimates are unchanged. Retry with fewer optional reading images or use manual takeoff.",
  },
  ANALYSIS_INTERRUPTED: {
    status: 504,
    message:
      "Analysis was interrupted or cancelled. Existing estimates are unchanged. You can retry when the previous request has stopped.",
  },
  ANALYSIS_CLIENT_TIMEOUT: {
    status: 504,
    message:
      "The analysis service did not respond within two minutes. The server may still be finishing; wait briefly before retrying. Existing estimates are unchanged.",
  },
  ANALYSIS_FAILED: {
    status: 502,
    message:
      "Plans could not be analyzed because of an unexpected service error. Existing estimates are unchanged. Retry or use manual takeoff.",
  },
} as const;
export type AnalysisErrorCode = keyof typeof analysisErrors;
export class AnalysisFailure extends Error {
  constructor(
    public readonly code: AnalysisErrorCode,
    public readonly retryAfterSeconds?: number,
  ) {
    super(analysisErrors[code].message);
    this.name = "AnalysisFailure";
  }
}
export function isAnalysisErrorCode(
  value: unknown,
): value is AnalysisErrorCode {
  return typeof value === "string" && Object.hasOwn(analysisErrors, value);
}
