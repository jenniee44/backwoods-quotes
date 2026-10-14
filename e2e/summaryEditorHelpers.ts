import type { Page } from "@playwright/test";
export async function expandSummaryEditors(page: Page) {
  const closed = page.locator(
    ".summary-material-category:not([open]) > summary, .material-reference-section:not([open]) > summary",
  );
  while (await closed.count()) await closed.first().click();
}
