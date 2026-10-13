import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
test("purchasing categories retain separate beam, joist and hanger assemblies without summed quantities", async ({
  page,
}) => {
  const s = seed(),
    q = s.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic grouped purchasing";
  const base: TakeoffItem = {
    id: "b1",
    description: "Beam B-1",
    specification: "3-ply 2x10 PT",
    quantity: 3,
    unit: "runs",
    documentId: "synthetic",
    page: 1,
    location: "Deck A",
    notes: "New work",
    confidence: "High",
    destination: "Materials",
    category: "Beams",
    status: "Proposed",
    origin: "ai",
    workScope: "New work",
    included: true,
    sourceFacts: ["Synthetic beam line B-1"],
  };
  q.takeoff = [
    base,
    {
      ...base,
      id: "b2",
      description: "Beam B-2",
      page: 2,
      sourceFacts: ["Synthetic separate beam line B-2"],
    },
    {
      ...base,
      id: "j1",
      description: "Inner deck joists",
      specification: "2x6 PT",
      unit: "boards",
      category: "Joists",
    },
    {
      ...base,
      id: "j2",
      description: "Outer deck joists",
      specification: "2x6 PT",
      unit: "boards",
      category: "Joists",
    },
    {
      ...base,
      id: "h1",
      description: "LUS26 joist hangers at ledger",
      specification: "Simpson LUS26",
      category: "Hangers / connectors",
      unit: "each",
    },
    {
      ...base,
      id: "h2",
      description: "LUS26 joist hangers at beam",
      specification: "Simpson LUS26",
      category: "Hangers / connectors",
      unit: "each",
    },
    {
      ...base,
      id: "ref",
      description: "Existing house",
      workScope: "Existing work to remain",
      included: false,
    },
  ];
  await page.goto("/");
  await page.evaluate(
    ({ s, key }) => localStorage.setItem(key, JSON.stringify(s)),
    { s, key: storageKey },
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Synthetic grouped purchasing/ })
    .click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.getByRole("button", { name: /Preliminary Shopping List/ }).click();
  const list = page.locator(".preliminary-materials");
  await expect(list.locator("tbody>tr")).toHaveCount(3);
  await expect(list.locator('td[data-label="Quantity"] strong')).toHaveText([
    "To confirm",
    "To confirm",
    "To confirm",
  ]);
  await expect(list).not.toContainText("Existing house");
  const beam = list.locator("#summary-b1");
  await expect(beam).not.toContainText("beam lengths");
  await beam
    .getByRole("button", { name: "Review details", exact: true })
    .click();
  const context = page.locator("#takeoff-b1 .purchasing-review-context");
  await expect(context).toContainText("beam lengths");
  await expect(
    context.getByText("Synthetic separate beam line B-2", { exact: true }),
  ).toBeVisible();
  await expect(context).not.toContainText("6 runs");
  await context
    .getByRole("button", { name: "Review this observation" })
    .click();
  await expect(page.locator("#takeoff-b2")).toHaveClass(
    /material-navigation-highlight/,
  );
  await page.getByRole("button", { name: "Back to Materials Summary" }).click();
  await expect(page.locator("#summary-b2")).toHaveClass(
    /material-navigation-highlight/,
  );
});
