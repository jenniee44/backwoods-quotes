import { test, expect } from "@playwright/test";
import { seed, storageKey, type TakeoffItem } from "../src/model";
const beam: TakeoffItem = {
  id: "beam-1",
  description: "Deck beams",
  category: "Beams",
  specification: "3PLY 2X10 PT",
  quantity: 3,
  unit: "runs",
  origin: "ai",
  status: "Proposed",
  confidence: "Low",
  classification: "Contractor input required",
  destination: "Materials",
  documentId: "synthetic",
  page: 1,
  notes: "New work",
  workScope: "New work",
  included: true,
  location: "Rear deck beam assembly",
  sourceFacts: [
    "Three distinct beam runs on the framing plan.",
    "Same beam runs shown in elevation.",
  ],
};
for (const width of [1366, 390])
  test(`saved repeated beam observations reopen with three proposed runs and plies at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic saved beam repair";
    q.takeoff = [1, 2, 3, 4].map((n) => ({
      ...beam,
      id: "beam-" + n,
      page: n,
    }));
    const manual = structuredClone(q.lines);
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    for (let reopen = 0; reopen < 2; reopen++) {
      await page.reload();
      await page
        .getByRole("button", { name: /Synthetic saved beam repair/ })
        .click();
      await page
        .getByRole("button", { name: "Plans & Takeoff", exact: true })
        .click();
      await expect(page.locator(".material-category-row")).toHaveCount(1);
      await page
        .getByLabel("Edit assemblies: beam-1", { exact: true })
        .getByRole("button", { name: "Review details" })
        .click();
      const panel = page.getByRole("group", {
        name: "Material purchasing calculator",
      });
      await expect(
        panel.getByLabel("Number of separate beam runs", { exact: true }),
      ).toHaveValue("3");
      for (const n of [1, 2, 3]) {
        const card = panel.getByRole("region", {
          name: `Beam ${n}`,
          exact: true,
        });
        await expect(
          card.getByLabel("Number of plies", { exact: true }),
        ).toHaveValue("3");
        await expect(
          card.getByLabel("Beam length — feet", { exact: true }),
        ).toHaveValue("");
        await expect(card).toContainText("beam length could not be confirmed");
      }
      await expect(panel).toContainText("Purchase quantity: To confirm");
      await expect(
        page
          .locator("#takeoff-beam-1")
          .getByRole("button", { name: "Approve material", exact: true }),
      ).toBeDisabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect
        .poll(() =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff.filter(
                (t: TakeoffItem) => t.status === "Rejected",
              ).length,
            storageKey,
          ),
        )
        .toBe(3);
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).quotes[0],
        storageKey,
      );
      expect(saved.takeoff).toHaveLength(4);
      expect(saved.lines).toEqual(manual);
      expect(saved.takeoff[0].calculation.inputs.runs).toBe(3);
    }
  });
test("manual run entry populates never-entered plies in a previously blank saved calculator", async ({
  page,
}) => {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic blank beam calculator";
  q.takeoff = [
    {
      ...beam,
      quantity: null,
      unit: "boards",
      sourceFacts: [
        "Beam specification: 3PLY 2X10 PT; length and run count unknown.",
      ],
      calculation: { kind: "beam-runs", inputs: {}, verified: false },
    },
  ];
  await page.goto("/");
  await page.evaluate(
    ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
    { store, key: storageKey },
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Synthetic blank beam calculator/ })
    .click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page
    .getByLabel("Edit assemblies: beam-1", { exact: true })
    .getByRole("button", { name: "Review details" })
    .click();
  const panel = page.getByRole("group", {
    name: "Material purchasing calculator",
  });
  await expect(
    panel.getByLabel("Number of separate beam runs", { exact: true }),
  ).toHaveValue("");
  await panel
    .getByLabel("Number of separate beam runs", { exact: true })
    .fill("3");
  await panel.getByLabel("Waste allowance (%)", { exact: true }).click();
  for (const n of [1, 2, 3])
    await expect(
      panel
        .getByRole("region", { name: `Beam ${n}`, exact: true })
        .getByLabel("Number of plies", { exact: true }),
    ).toHaveValue("3");
  await expect(panel).toContainText("Purchase quantity: To confirm");
});
