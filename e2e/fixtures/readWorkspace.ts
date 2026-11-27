import type { Page } from "@playwright/test";
import type { Store } from "../../src/model";

export function readWorkspace(page: Page): Promise<Store> {
  return page.evaluate(async () => {
    const path = "/src/durableStore.ts";
    const { readDurableStore } = await import(path);
    const stored = await readDurableStore();
    if (!stored) throw new Error("Missing durable workspace");
    return stored;
  });
}
