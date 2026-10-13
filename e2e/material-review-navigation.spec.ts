import { expect, test } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
async function setup(page: import("@playwright/test").Page) {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic review navigation";
  const t: TakeoffItem = {
    id: "missing",
    description: "Deck posts",
    specification: "6x6 PT",
    quantity: null,
    unit: "posts",
    documentId: "synthetic",
    page: 1,
    notes: "New work",
    status: "Proposed",
    origin: "ai",
    confidence: "High",
    destination: "Materials",
    category: "Posts",
    workScope: "New work",
    included: true,
    location: "Rear supports",
    sourceFacts: ["Synthetic drawing observation"],
    calculationBasis: "Verified quantity still required",
  };
  q.takeoff = [
    t,
    {
      ...t,
      id: "joist",
      description: "Deck joists",
      category: "Joists",
      specification: "2x6 PT at 16 in O/C",
      quantity: 8,
      unit: "boards",
      location: "Rear framing",
    },
    {
      ...t,
      id: "peer",
      description: "PT deck joists",
      category: "Joists",
      specification: "2x6 PT at 16 in O/C",
      quantity: 10,
      unit: "boards",
      location: "Rear framing",
    },
    {
      ...t,
      id: "excluded",
      description: "Existing footing",
      specification: "Concrete pier",
      category: "Footings / concrete",
      quantity: 1,
      unit: "each",
      workScope: "Existing work to remain",
      included: false,
      status: "Rejected",
      location: "Existing support",
      notes: "Existing footing to remain",
    },
  ];
  await page.goto("/");
  await page.evaluate(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Synthetic review navigation/ })
    .click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  return q.takeoff;
}
for (const width of [1366, 390])
  test(
    "Review details targets missing, duplicate and excluded materials and returns to exact summary row at " +
      width +
      "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const original = await setup(page);
      // A filter in Advanced Review must not hide the requested target.
      await page.locator(".advanced-review > summary").click();
      await page
        .getByRole("navigation", { name: "Material review summary" })
        .getByRole("button", { name: /Ready for review/ })
        .click();
      await page.locator(".advanced-review > summary").click();
      for (const id of ["missing", "joist", "excluded"]) {
        const summary = page.locator("#summary-" + id);
        await summary
          .getByRole("button", { name: "Review details", exact: true })
          .click();
        await expect(page.locator(".advanced-review")).toHaveAttribute("open");
        const row = page.locator("#takeoff-" + id);
        await expect(row.locator(".takeoff-evidence")).toHaveAttribute("open");
        await expect(row.locator(".takeoff-advanced")).toHaveAttribute("open");
        await expect(
          row.getByLabel("Takeoff quantity", { exact: true }),
        ).toBeVisible();
        await expect(
          row.getByLabel("Written specification", { exact: true }),
        ).toBeVisible();
        await expect(
          row.getByRole("textbox", { name: "Source facts", exact: true }),
        ).toBeVisible();
        await expect(
          row.getByRole("textbox", { name: "Source facts", exact: true }),
        ).toHaveValue(/Synthetic drawing observation/);
        await expect(row).toHaveClass(/material-navigation-highlight/);
        await expect
          .poll(() => row.evaluate((e) => document.activeElement === e))
          .toBe(true);
        await expect
          .poll(() =>
            row.evaluate((e) => {
              const r = e.getBoundingClientRect();
              return r.top < innerHeight && r.bottom > 0;
            }),
          )
          .toBe(true);
        if (id === "joist")
          await expect(
            row.getByRole("heading", { name: "Review possible duplicates" }),
          ).toBeVisible();
        await row
          .getByRole("button", { name: "Back to Materials Summary" })
          .click();
        await expect(summary).toHaveClass(/material-navigation-highlight/);
        await expect
          .poll(() => summary.evaluate((e) => document.activeElement === e))
          .toBe(true);
        await expect
          .poll(() =>
            summary.evaluate((e) => {
              const r = e.getBoundingClientRect();
              return r.top < innerHeight && r.bottom > 0;
            }),
          )
          .toBe(true);
        await page.locator(".advanced-review > summary").click();
      }
      // Navigation and expansion must not change quote data or approval.
      await expect
        .poll(() =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).quotes.find(
                (q: { name: string }) =>
                  q.name === "Synthetic review navigation",
              ).takeoff,
            storageKey,
          ),
        )
        .toEqual(original);
    },
  );
test("Needs Attention filter reveals the same exact material and repeated navigation restarts highlighting", async ({
  page,
}) => {
  await setup(page);
  const region = page.getByRole("region", { name: "Materials Summary" });
  await region.getByText(/Needs Attention —/).click();
  const entry = region.locator("#summary-missing");
  for (let n = 0; n < 2; n++) {
    await entry
      .getByRole("button", { name: "Review details", exact: true })
      .click();
    const row = page.locator("#takeoff-missing");
    await expect(row.locator(".takeoff-advanced")).toHaveAttribute("open");
    await expect
      .poll(() => row.evaluate((e) => document.activeElement === e))
      .toBe(true);
    await row
      .getByRole("button", { name: "Back to Materials Summary" })
      .click();
  }
});
