import { handleAnalysis } from "../../server/handler";
import type { Env } from "../../server/handler";
export const onRequest: PagesFunction<Env> = ({ request, env }) =>
  handleAnalysis(request, env);
