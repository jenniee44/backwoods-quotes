import { expect, test } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
import { openAdvancedMaterial } from "./material-review.helpers";
async function setup(
  page: import("@playwright/test").Page,
  mode: "default" | "duplicates" | "conflict" = "default",
) {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic quick review";
  const t: TakeoffItem = {
    id: "post",
    description: "Deck posts",
    specification: "6x6 PT",
    category: "Posts",
    destination: "Materials",
    quantity: 4,
    unit: "each",
    documentId: "plan",
    page: 1,
    notes: "New work",
    confidence: "High",
    status: "Proposed",
    origin: "ai",
    workScope: "New work",
    included: true,
    sourceFacts: ["Four posts, synthetic page 1"],
  };
  q.takeoff = [
    t,
    {
      ...t,
      id: "missing",
      description: "Decking boards",
      category: "Decking",
      quantity: null,
      specification: "PT deck boards",
      location: "Deck",
    },
    {
      ...t,
      id: "remain",
      description: "Existing pier to remain",
      category: "Footings / concrete",
      workScope: "Existing work to remain",
      included: false,
    },
    {
      ...t,
      id: "scope",
      description: "Stair scope",
      category: "Stairs / stringers",
      workScope: "Requires scope confirmation",
      included: false,
    },
  ];
  if (mode === "duplicates")
    q.takeoff = [
      {
        ...t,
        location: "Rear deck",
        sourceFacts: ["New work, four posts, page 1"],
      },
      {
        ...t,
        id: "same",
        location: "Rear deck",
        page: 2,
        description: "PT support posts",
        sourceFacts: ["Section page 2 references the same four posts"],
      },
      {
        ...t,
        id: "different",
        location: "Front deck",
        description: "Front deck posts",
        sourceFacts: ["Separate front deck assembly"],
      },
    ];
  if (mode === "conflict")
    q.takeoff = [
      {
        ...t,
        quantity: null,
        warnings: ["Conflicting counts: page 1 shows four, page 2 shows six"],
        sourceFacts: ["Original counts 4 and 6; verify on site"],
      },
    ];
  await page.goto("/");
  await page.evaluate(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.reload();
  await page.getByRole("button", { name: /Synthetic quick review/ }).click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page.locator(".advanced-review > summary").click();
}
test("compact cards offer quick edits, summary navigation and explicit approval before safe batch conversion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await setup(page);
  const rows = page.locator(".takeoff-table > tbody.line-card"),
    posts = rows.filter({
      has: page
        .locator(".material-card-heading")
        .getByText("Deck posts", { exact: true }),
    });
  await expect(
    posts.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(
    posts.getByRole("button", { name: "Approve material", exact: true }),
  ).toBeEnabled();
  await expect(
    posts.getByRole("button", { name: "Exclude", exact: true }),
  ).toBeVisible();
  await expect(posts.getByLabel("Written specification")).not.toBeVisible();
  await expect(page.locator(".missing-information")).toHaveCount(0);
  await posts.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(posts.getByLabel("Edit material description")).toHaveValue(
    "Deck posts",
  );
  await expect(
    posts.getByLabel("Verified quantity", { exact: true }),
  ).toHaveValue("4");
  await expect(posts.getByLabel("Missing material specification")).toHaveCount(
    0,
  );
  await expect(posts.getByLabel("Confirm work scope")).toHaveCount(0);
  await expect(posts.getByLabel("Source facts")).not.toBeVisible();
  await posts.getByLabel("Verified quantity", { exact: true }).fill("5");
  await posts.getByRole("button", { name: "Save changes" }).click();
  page.once("dialog", (d) => d.dismiss());
  await posts
    .getByRole("button", { name: "Approve material", exact: true })
    .click();
  await expect(posts.locator(".material-card-quantity")).not.toContainText(
    "Approved",
  );
  page.once("dialog", (d) => d.accept());
  await posts
    .getByRole("button", { name: "Approve material", exact: true })
    .click();
  const summary = page.getByRole("region", {
    name: "Reviewed estimate summary",
  });
  await expect(summary).toContainText("1 approved item");
  await summary
    .getByText("Review approved material list", { exact: true })
    .click();
  await expect(summary).toContainText("Deck posts — 5 each");
  const counts = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).quotes.find(
        (q: { name: string }) => q.name === "Synthetic quick review",
      ).lines.length,
    storageKey,
  );
  page.once("dialog", (d) => d.accept());
  await summary
    .getByRole("button", { name: "Add approved items to estimate" })
    .click();
  await expect(posts).toContainText("Added to estimate");
  await expect(summary).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).quotes.find(
            (q: { name: string }) => q.name === "Synthetic quick review",
          ).lines.length,
        storageKey,
      ),
    )
    .toBe(counts + 1);
  const nav = page.getByRole("navigation", { name: "Material review summary" });
  await nav
    .getByRole("button", { name: /Needs quantity or specification/ })
    .click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Decking boards");
  await rows.first().getByRole("button", { name: "Edit", exact: true }).click();
  await rows
    .first()
    .getByLabel("Verified quantity", { exact: true })
    .fill("32");
  // Keep an item visible while editing, even if its missing input is resolved.
  await expect(rows).toHaveCount(1);
  await rows.first().getByRole("button", { name: "Save changes" }).click();
  await expect(rows).toHaveCount(0);
  await nav.getByRole("button", { name: /All items/ }).click();
  const remain = rows.filter({
    has: page
      .locator(".material-card-heading")
      .getByText("Existing pier to remain", { exact: true }),
  });
  await expect(
    remain.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  const scope = rows.filter({
    has: page
      .locator(".material-card-heading")
      .getByText("Stair scope", { exact: true }),
  });
  await expect(
    scope.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  await scope.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(scope.getByLabel("Confirm work scope")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await nav.boundingBox())!.height).toBeLessThan(300);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/backwoods-quick-material-review-mobile.png",
    fullPage: true,
  });
});
test("missing specifications, conflicts and unknown purchase quantities cannot bypass verification", async ({
  page,
}) => {
  await setup(page);
  const rows = page.locator(".takeoff-table > tbody.line-card");
  const decking = rows.filter({
    has: page
      .locator(".material-card-heading")
      .getByText("Decking boards", { exact: true }),
  });
  await decking.getByRole("button", { name: "Edit", exact: true }).click();
  await decking.getByLabel("Verified quantity", { exact: true }).fill("12");
  await decking.getByRole("button", { name: "Save changes" }).click();
  await openAdvancedMaterial(decking);
  await decking.getByLabel("Written specification").fill("unreadable");
  await expect(
    decking.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  await decking
    .getByRole("button", { name: "Mark reviewed — I verified this item" })
    .click();
  await expect(page.getByRole("alert")).toContainText("specification");
  await decking.getByRole("button", { name: "Exclude", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Material review summary" });
  await nav.getByRole("button", { name: /Excluded or informational/ }).click();
  await expect(rows).toHaveCount(2);
});

test("clear equivalent source observations group into one card while distinct locations and all references remain", async ({
  page,
}) => {
  await setup(page, "duplicates");
  const rows = page.locator(".takeoff-table > tbody.line-card");
  await expect(rows).toHaveCount(2);
  const posts = rows.filter({
    has: page
      .locator(".material-card-heading")
      .getByText("Deck posts", { exact: true }),
  });
  await expect(posts.locator(".material-card-quantity")).toContainText(
    "4 each",
  );
  await openAdvancedMaterial(posts);
  await expect(posts).toContainText(
    "Section page 2 references the same four posts",
  );
  await expect(posts).toContainText("page 1");
  await expect(posts).toContainText("page 2");
  await expect(posts.getByLabel("Source facts")).toBeVisible();
  await posts.locator(".takeoff-advanced > summary").click();
  await expect(posts.getByLabel("Source facts")).not.toBeVisible();
});
test("conflicting counts need explicit reconciliation and changing the quantity invalidates it", async ({
  page,
}) => {
  await setup(page, "conflict");
  const row = page.locator(".takeoff-table > tbody.line-card").first();
  await expect(
    row.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await row.getByLabel("Verified quantity", { exact: true }).fill("4");
  await row.getByRole("button", { name: "Save changes" }).click();
  await expect(
    row.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  await openAdvancedMaterial(row);
  await row.getByLabel("I reconciled the conflicting observations").check();
  await expect(row).toContainText("Original counts 4 and 6");
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Approve material" }).click();
  await expect(
    page.getByRole("region", { name: "Reviewed estimate summary" }),
  ).toContainText("1 approved item");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await row.getByLabel("Verified quantity", { exact: true }).fill("6");
  await row.getByRole("button", { name: "Save changes" }).click();
  await expect(
    row.getByRole("button", { name: "Approve material" }),
  ).toBeDisabled();
  await expect(row.getByLabel("Source facts")).not.toBeVisible();
  await openAdvancedMaterial(row);
  await expect(
    row.getByLabel("I reconciled the conflicting observations"),
  ).not.toBeChecked();
  await expect(row).toContainText("page 1 shows four, page 2 shows six");
});
