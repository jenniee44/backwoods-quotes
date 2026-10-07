import { test, expect } from "@playwright/test";
test("mobile template choice is explicit, empty quotes need no confirmation, repeat clicks cannot duplicate", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create New Quote" }).click();
  await page.getByLabel("Customer name *").fill("Template test");
  await page.getByLabel("Job name *").fill("Basement");
  let dialogs = 0;
  page.on("dialog", async (d) => {
    dialogs++;
    await d.accept();
  });
  await page
    .getByLabel("Apply construction template")
    .selectOption("renovation");
  await expect(page.getByLabel("Apply construction template")).toHaveValue(
    "renovation",
  );
  await page
    .getByRole("button", { name: "Apply selected template" })
    .dblclick();
  expect(dialogs).toBe(0);
  await expect(
    page.getByText(/Basement Renovation template applied/),
  ).toBeVisible();
  await expect(
    page.getByLabel("Description *").filter({ hasText: "Footings" }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Description *").nth(1)).toHaveValue(
    "Framing labour",
  );
  await page
    .getByRole("button", { name: "Customer & job", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply selected template" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Applied templates: Basement Renovation"),
  ).toBeVisible();
  await page.getByLabel("Apply construction template").selectOption("bathroom");
  await page
    .getByRole("button", { name: "Apply selected template" })
    .dblclick();
  expect(dialogs).toBe(1);
  await page
    .getByRole("button", { name: "Customer & job", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply selected template" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Applied templates: Basement Renovation, Bathroom Renovation",
    ),
  ).toBeVisible();
});

// Exercise the real select/application path for every catalog, not just the model.
import { constructionTemplates } from "../src/model";
for (const template of constructionTemplates) {
  test(`template picker inserts ${template.name} catalog only`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Create New Quote" }).click();
    await page
      .getByLabel("Apply construction template")
      .selectOption(template.id);
    await page.getByRole("button", { name: "Apply selected template" }).click();
    for (const kind of ["Labour", "Materials", "Other Costs"] as const) {
      await page
        .getByRole("button", {
          name: kind === "Other Costs" ? "Subcontractors & Other Costs" : kind,
          exact: true,
        })
        .click();
      const fields = page.getByLabel("Description *", { exact: true });
      const expected = template.lines
        .filter((l) => l.kind === kind)
        .map((l) => l.description);
      await expect(fields).toHaveCount(expected.length);
      for (let i = 0; i < expected.length; i++)
        await expect(fields.nth(i)).toHaveValue(expected[i]);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
