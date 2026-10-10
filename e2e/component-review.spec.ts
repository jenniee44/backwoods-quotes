import { expect, test } from "@playwright/test";
import { seed } from "../src/model";
import { addAnalysisSuggestions } from "../src/planAnalysis";
import { analysisFixture } from "../shared/analysis.fixture";
test("equivalent observations share one candidate, remain/excluded scopes stay unpriced and beam runs require purchase verification", async ({
  page,
}) => {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic component review";
  q.takeoff = [];
  q.documents = [
    {
      id: "plan",
      name: "Synthetic source",
      type: "image/png",
      data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lGkAAAAASUVORK5CYII=",
      addedAt: new Date().toISOString(),
    },
  ];
  const fixture = analysisFixture();
  const base = {
    ...fixture.suggestions[1],
    specification: "6x6 PT",
    location: "Rear deck",
    description: "Posts",
    quantity: 4,
    sourceFacts: ["New work: four unique posts on page 1"],
  };
  fixture.suggestions = [
    base,
    {
      ...base,
      page: 2,
      specification: "6 × 6 pressure-treated",
      sourceFacts: ["Page 2 section references the same four posts"],
    },
    {
      ...base,
      description: "Existing concrete pier to remain",
      specification: "Existing 12 in pier",
      quantity: 1,
      notes: "Existing pier and footing to remain",
    },
    {
      ...base,
      description: "Guards by others",
      specification: "Aluminum guard",
      notes: "Guards by others",
      quantity: null,
    },
    {
      ...base,
      description: "3-ply 2x10 beam runs",
      specification: "3-ply 2x10 PT",
      unit: "runs",
      quantity: 5,
    },
  ];
  store.quotes[0] = addAnalysisSuggestions(q, fixture);
  const repeated = analysisFixture();
  repeated.suggestions = [
    {
      ...base,
      page: 3,
      sourceFacts: ["Page 3 support detail corroborates the same four posts"],
    },
  ];
  store.quotes[0] = addAnalysisSuggestions(store.quotes[0], repeated);
  await page.goto("/");
  await page.evaluate(
    (data) => localStorage.setItem("backwoods-quotes-v1", JSON.stringify(data)),
    store,
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Synthetic component review/ })
    .click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  const rows = page.locator(".takeoff-table > tbody.line-card");
  await expect(rows).toHaveCount(4);
  const posts = rows.filter({ has: page.locator('input[value="Posts"]') });
  await expect(posts).toContainText("4 each");
  await posts
    .getByText("Review material — specifications, evidence & calculations", {
      exact: true,
    })
    .click();
  await expect(posts).toContainText("page 2");
  await expect(posts).toContainText(
    "Page 3 support detail corroborates the same four posts",
  );
  const remain = rows.filter({ hasText: "Existing concrete pier to remain" });
  await remain
    .getByText("Review material — specifications, evidence & calculations", {
      exact: true,
    })
    .click();
  await expect(remain.getByLabel("Work scope")).toHaveValue(
    "Existing work to remain",
  );
  await expect(
    remain.getByLabel("Explicitly include this work in our contract"),
  ).toBeDisabled();
  await expect(
    remain.getByLabel("Convert reviewed item to estimate"),
  ).toBeDisabled();
  const excluded = rows.filter({ hasText: "Guards by others" });
  await excluded
    .getByText("Review material — specifications, evidence & calculations", {
      exact: true,
    })
    .click();
  await expect(excluded.getByLabel("Suggested destination")).toHaveValue(
    "Informational",
  );
  const beam = rows.filter({ hasText: "3-ply 2x10 beam runs" });
  await beam
    .getByText("Review material — specifications, evidence & calculations", {
      exact: true,
    })
    .click();
  await beam
    .getByRole("button", {
      name: "Mark reviewed — I verified this item",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "not purchase quantities" }),
  ).toContainText("not purchase quantities");
  await beam.getByLabel("Takeoff unit", { exact: true }).fill("boards");
  await beam.getByLabel("Takeoff quantity", { exact: true }).fill("18");
  await beam.getByLabel("I verified beam purchase quantities").check();
  await beam
    .getByRole("button", {
      name: "Mark reviewed — I verified this item",
      exact: true,
    })
    .click();
  await beam.getByRole("button", { name: "Approve item", exact: true }).click();
  await beam
    .getByLabel("Convert reviewed item to estimate")
    .selectOption("Materials");
  await expect(beam).toContainText("Converted to an estimate line");
  await expect(
    beam.getByLabel("Takeoff quantity", { exact: true }),
  ).toBeDisabled();
  await expect(
    beam.getByLabel("Convert reviewed item to estimate"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
