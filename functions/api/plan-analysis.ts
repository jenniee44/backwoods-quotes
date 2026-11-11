import { handleAnalysis } from "../../server/handler";
import type { Env } from "../../server/handler";
export const onRequest: PagesFunction<Env> = (context) =>
  handleAnalysis(context.request, context.env, undefined, (work) =>
    context.waitUntil(work),
  );
