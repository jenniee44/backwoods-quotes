/** Bound fetch + body reading even if an implementation ignores abort. No automatic retry. */
export async function abortableAnalysis<T>(
  task: (signal: AbortSignal) => Promise<T>,
  outer: AbortSignal | undefined,
  timeout: number,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(outer?.reason);
  if (outer?.aborted) cancel();
  else outer?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException("Analysis deadline exceeded", "TimeoutError"),
      ),
    timeout,
  );
  let rejectAbort: (() => void) | undefined;
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const aborted = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    return await Promise.race([
      Promise.resolve().then(() => task(controller.signal)),
      aborted,
    ]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", cancel);
    if (rejectAbort)
      controller.signal.removeEventListener("abort", rejectAbort);
  }
}
