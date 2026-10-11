import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
async function open(page: import("@playwright/test").Page) {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic shopping list";
  const t: TakeoffItem = {
    id: "joist",
    description: "Deck joists",
    specification: "2x6 PT at 16 in O/C",
    category: "Miscellaneous",
    destination: "Materials",
    quantity: null,
    unit: "boards",
    documentId: "plan",
    page: 1,
    notes: "New work; synthetic source only",
    sourceFacts: ["Synthetic deck framing detail"],
    confidence: "High",
    origin: "ai",
    workScope: "New work",
    included: true,
    status: "Proposed",
    location: "Rear deck",
  };
  q.takeoff = [
    t,
    {
      ...t,
      id: "flashing",
      description: "Aluminum ledger flashing",
      specification: "Contractor-selected flashing",
      quantity: 20,
      unit: "ft",
      location: "Ledger",
    },
    {
      ...t,
      id: "footing",
      description: "Concrete footing",
      category: "Footings / concrete",
      specification: "Verified engineer footing specification",
      quantity: 4,
      unit: "each",
      scopeVerified: true,
    },
    {
      ...t,
      id: "decking",
      description: "Deck boards",
      specification: "PT decking",
      quantity: 30,
    },
  ];
  await page.goto("/");
  await page.evaluate(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.reload();
  await page.getByRole("button", { name: /Synthetic shopping list/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.locator(".advanced-review > summary").click();
  return q;
}
async function saved(page: import("@playwright/test").Page) {
  return page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).quotes.find(
        (q: { name: string }) => q.name === "Synthetic shopping list",
      ),
    storageKey,
  );
}
test("quick edit saves once, Cancel preserves the saved material and includes only relevant inputs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const original = await open(page);
  const row = page.locator("#takeoff-joist");
  await expect(row.locator(".material-next-action")).toHaveText(
    "Enter verified joist quantity",
  );
  for (const name of [
    "Deck Framing",
    "Decking",
    "Footings & Foundations",
    "Flashing & Waterproofing",
  ])
    await expect(
      page.getByRole("heading", {
        name: new RegExp("^" + name.replace("&", "&")),
      }),
    ).toBeVisible();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(row.getByLabel("Edit material specification")).toHaveValue(
    "2x6 PT at 16 in O/C",
  );
  await expect(row.getByLabel("Required stock length (ft)")).toBeVisible();
  await expect(row.getByLabel("Source document")).not.toBeVisible();
  await row.getByLabel("Verified quantity", { exact: true }).fill("18");
  await row
    .getByLabel("Edit material specification")
    .fill("Contractor verified 2x6 PT");
  await row.getByLabel("Required stock length (ft)").fill("12");
  expect((await saved(page)).takeoff[0].quantity).toBeNull();
  await row.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).takeoff[0]).toEqual(original.takeoff[0]);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await row.getByLabel("Verified quantity", { exact: true }).fill("18");
  await row.getByLabel("Required stock length (ft)").fill("12");
  await row.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect
    .poll(async () => (await saved(page)).takeoff[0].quantity)
    .toBe(18);
  expect((await saved(page)).takeoff[0].stockLength).toBe(12);
  await expect(
    row.getByRole("button", { name: "Approve material" }),
  ).toBeEnabled();
  await row.getByText("View details", { exact: true }).click();
  await expect(row.getByLabel("Source document")).not.toBeVisible();
  await row.locator(".takeoff-advanced > summary").click();
  for (const label of [
    "Source document",
    "Page number (optional)",
    "Evidence type",
    "Calculation basis",
    "Alternative assembly group",
    "Alternative construction method",
    "Takeoff category",
  ])
    await expect(row.getByLabel(label)).toBeVisible();
  await row.getByText("View details", { exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Approve material" }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Add approved items to estimate" })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).lines.filter(
          (l: { takeoffId?: string }) => l.takeoffId === "joist",
        ).length,
    )
    .toBe(1);
  const result = await saved(page);
  expect(result.lines.slice(0, original.lines.length)).toEqual(original.lines);
  expect(
    result.lines.filter((l: { takeoffId?: string }) => l.takeoffId === "joist"),
  ).toHaveLength(1);
  await expect(row).toContainText("Added to estimate");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/backwoods-shopping-list-mobile.png",
    fullPage: true,
  });
});
test("Include No excludes without pricing, incomplete materials remain blocked and non-lumber hides stock input", async ({
  page,
}) => {
  await open(page);
  const row = page.locator("#takeoff-flashing");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(row.getByLabel("Required stock length (ft)")).toHaveCount(0);
  await row.getByLabel("Include in quote").selectOption("No");
  await row.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  await expect
    .poll(
      async () =>
        (await saved(page)).takeoff.find(
          (t: { id: string }) => t.id === "flashing",
        ).included,
    )
    .toBe(false);
  const joist = page.locator("#takeoff-joist");
  await expect(
    joist.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  await joist.getByRole("button", { name: "Edit", exact: true }).click();
  await joist.getByLabel("Verified quantity", { exact: true }).fill("5");
  await joist.getByLabel("Edit material specification").fill("unreadable");
  await joist
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(
    joist.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  await expect(joist.locator(".material-next-action")).toHaveText(
    "Confirm material specification",
  );
});
