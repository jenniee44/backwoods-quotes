import type { Page } from "@playwright/test";

export async function selectEditorTab(page: Page, label: string): Promise<void> {
  const tab = page.getByRole("button", { name: label, exact: true });
  const advanced = page.getByRole("button", { name: "Show advanced tools", exact: true });
  await tab.or(advanced).first().waitFor({ state: "visible" });
  if (await advanced.isVisible()) await advanced.click();
  await tab.click();
}
