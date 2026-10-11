import type { Locator } from "@playwright/test";
export async function openAdvancedMaterial(row: Locator) {
  const parent = row.locator(
    'xpath=ancestor::details[contains(@class,"advanced-review")]',
  );
  if (
    (await parent.count()) &&
    !(await parent.evaluate((e) => (e as HTMLDetailsElement).open))
  )
    await parent.locator(":scope > summary").click();
  const details = row.locator(".takeoff-evidence");
  if (!(await details.evaluate((e) => (e as HTMLDetailsElement).open)))
    await row.getByText("View details", { exact: true }).click();
  const advanced = row.locator(".takeoff-advanced");
  if (!(await advanced.evaluate((e) => (e as HTMLDetailsElement).open)))
    await advanced.locator(":scope > summary").click();
}
