import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
test("repeated framing and hardware consolidate; notes/existing work stay out of purchasing; footings compare separately", async ({
  page,
}) => {
  const s = seed(),
    q = s.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic repeated elevations";
  const base: TakeoffItem = {
    id: "beam",
    description: "Built-up beams",
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
    scopeGroup: "Beams",
    status: "Proposed",
    origin: "ai",
    workScope: "New work",
    included: true,
    sourceFacts: ["Framing plan page 1: three beam runs"],
  };
  const joist = {
    ...base,
    id: "joists",
    description: "Deck joists",
    specification: "2x6 PT at 16 in O/C",
    category: "Joists",
    quantity: null,
    unit: "boards",
    confidence: "Low" as const,
  };
  const hanger = {
    ...joist,
    id: "hanger",
    description: "Simpson LUS26 joist hangers",
    specification: "Simpson LUS26",
    category: "Hangers / connectors",
    scopeGroup: "Connectors",
    unit: "each",
  };
  q.takeoff = [
    base,
    {
      ...base,
      id: "beam-repeat",
      page: 2,
      scopeGroup: "Deck Framing",
      unit: "beam runs",
      sourceFacts: ["Same three beam runs in elevation page 2"],
    },
    joist,
    { ...joist, id: "joist-repeat", page: 2, scopeGroup: "Deck Framing" },
    hanger,
    {
      ...hanger,
      id: "hanger-repeat",
      page: 3,
      scopeGroup: "Hangers / connectors",
    },
    {
      ...base,
      id: "concrete",
      description: "Concrete footing/piers",
      specification: "12 inch pier",
      category: "Footings / concrete",
      unit: "each",
      quantity: 4,
    },
    {
      ...base,
      id: "helical",
      description: "Helical pile footings",
      specification: "Engineered helical supports",
      category: "Footings / concrete",
      unit: "each",
      quantity: 4,
      alternativeGroup: "Foundation method",
      alternativeOption: "Helical",
    },
    {
      ...base,
      id: "existing",
      description: "Existing concrete pier to remain",
      workScope: "Existing work to remain",
      included: false,
    },
    {
      ...base,
      id: "notes",
      description: "General construction notes",
      quantity: null,
    },
  ];
  const originalLines = q.lines;
  await page.goto("/");
  await page.evaluate(
    ({ s, key }) => localStorage.setItem(key, JSON.stringify(s)),
    { s, key: storageKey },
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Synthetic repeated elevations/ })
    .click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  const region = page.getByRole("region", { name: "Materials Summary" });
  await region
    .getByRole("button", { name: /Preliminary Shopping List/ })
    .click();
  for (const id of [
    "beam-repeat",
    "joist-repeat",
    "hanger-repeat",
    "existing",
    "notes",
  ])
    await expect(
      region.locator(".preliminary-materials #summary-" + id),
    ).toHaveCount(0);
  // A supported component proposal is visible before approval, but is not
  // represented as purchasable boards or silently added across drawing views.
  await expect(
    region.locator('#summary-beam [data-label="Quantity"] strong'),
  ).toHaveText("3");
  await expect(
    region.locator('#summary-beam [data-label="Unit"]'),
  ).toContainText("runs");
  await expect(
    region.locator('#summary-beam [data-label="Status"]'),
  ).toContainText("Proposed");
  await expect(region.locator("#summary-joists")).toContainText("To confirm");
  await expect(region.locator("#summary-hanger")).toContainText("To confirm");
  await expect(region.locator("#summary-concrete")).toBeVisible();
  await expect(region.locator("#summary-helical")).toBeVisible();
  await region
    .locator("#summary-beam")
    .getByRole("button", { name: "Review details" })
    .click();
  await expect(page.locator("#takeoff-beam")).toContainText(
    "Same three beam runs in elevation page 2",
  );
  await expect(
    page.locator("#takeoff-beam .takeoff-advanced"),
  ).not.toHaveAttribute("open");
  await page.waitForTimeout(1500);
  const stored = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    storageKey,
  );
  expect(
    stored.quotes.find((v: { id: string }) => v.id === q.id).lines,
  ).toEqual(originalLines);
});
