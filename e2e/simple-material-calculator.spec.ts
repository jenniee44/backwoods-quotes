import { test, expect } from "@playwright/test";
import { seed, storageKey } from "../src/model";
import type { TakeoffItem } from "../src/model";
for (const width of [1366, 390])
  test(`simple beam review calculates confirmed individual runs and preserves approval at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic simple purchasing";
    const t: TakeoffItem = {
      id: "beam",
      description: "Built-up deck beam",
      specification: "3-ply 2x10 PT",
      quantity: null,
      unit: "boards",
      documentId: "synthetic",
      page: 1,
      notes: "New work",
      status: "Proposed",
      origin: "ai",
      confidence: "High",
      category: "Beams",
      destination: "Materials",
      workScope: "New work",
      included: true,
      sourceFacts: [
        "Beam B1 length: 12 ft",
        "Beam B1 length: 12 ft",
        "Beam B2 length: 20 ft",
      ],
      evidenceType: "Written specification",
      location: "Rear deck beam assembly",
    };
    q.takeoff = [t];
    const original = q.lines;
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic simple purchasing/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .getByLabel("Edit assemblies: beam", { exact: true })
      .getByRole("button", { name: "Review details" })
      .click();
    const row = page.locator("#takeoff-beam"),
      panel = row.getByRole("group", {
        name: "Material purchasing calculator",
      });
    await expect(panel).toBeVisible();
    await expect(row.locator(".takeoff-advanced")).not.toHaveAttribute("open");
    await expect(
      row.getByRole("textbox", { name: "Source facts", exact: true }),
    ).not.toBeVisible();
    await expect(panel.getByLabel("Calculator specifications")).toHaveValue(
      "3-ply 2x10 PT",
    );
    await panel
      .getByRole("button", { name: "Calculate purchasing quantity" })
      .click();
    await expect(
      panel.getByLabel("Material calculator", { exact: true }),
    ).toHaveValue("beam-runs");
    await panel
      .getByLabel("Number of separate beam runs", { exact: true })
      .fill("2");
    await panel.getByLabel("Waste allowance (%)", { exact: true }).fill("0");
    for (const [n, length, stock, pieces] of [
      [1, 12, 12, 1],
      [2, 20, 10, 2],
    ]) {
      const beam = panel.getByRole("region", {
        name: `Beam ${n}`,
        exact: true,
      });
      await beam
        .getByLabel(`Beam ${n} proposed drawing length`, { exact: true })
        .selectOption(String(n));
      await expect(
        beam.getByLabel("Beam length — feet", { exact: true }),
      ).toHaveValue(String(length));
      await expect(beam).toContainText(`Drawing reference: Beam B${n}`);
      if (n === 1) {
        await beam
          .getByLabel("Beam length — inches", { exact: true })
          .fill("7.5");
        await beam.getByLabel("Number of plies", { exact: true }).click();
        await expect(
          beam.getByLabel("Beam length — inches", { exact: true }),
        ).toHaveValue("7.5");
        await expect(beam).not.toContainText("Drawing reference:");
        await beam
          .getByLabel("Beam length — inches", { exact: true })
          .fill("0");
      }
      await beam
        .getByRole("button", {
          name: "Use drawing specification and 3 plies — proposed",
        })
        .click();
      await expect(
        beam.getByLabel("Number of plies", { exact: true }),
      ).toHaveValue("3");
      await beam
        .getByLabel("Stock board length (ft)", { exact: true })
        .fill(String(stock));
      await beam
        .getByLabel("Number of boards per ply", { exact: true })
        .fill(String(pieces));
      if (pieces > 1)
        await beam
          .getByLabel(`Beam ${n} approved arrangement`, { exact: true })
          .fill("Synthetic approved support and cutting layout");
      await beam
        .getByLabel(`Beam ${n} arrangement confirmed`, { exact: true })
        .check();
    }
    await expect(panel).toContainText("Purchase quantity: To confirm");
    await expect(
      row.getByRole("button", { name: "Approve material", exact: true }),
    ).toBeDisabled();
    await panel.getByLabel("I verified all calculator inputs").check();
    await expect(panel).toContainText("Purchase quantity: 9 boards");
    await expect(
      panel.getByRole("region", { name: "Beam lumber shopping list" }),
    ).toContainText("2x10 PT × 12 ft — 3 boards");
    await expect(
      panel.getByRole("region", { name: "Beam lumber shopping list" }),
    ).toContainText("2x10 PT × 10 ft — 6 boards");
    await panel.screenshot({ path: `/tmp/backwoods-simple-beam-${width}.png` });
    page.on("dialog", (d) => d.accept());
    await row
      .getByRole("button", { name: "Approve material", exact: true })
      .click();
    await expect(row).toContainText("Approved");
    await panel
      .getByRole("region", { name: "Beam 2", exact: true })
      .getByLabel("Beam length — feet", { exact: true })
      .fill("24");
    await panel
      .getByRole("region", { name: "Beam 1", exact: true })
      .getByLabel("Beam length — feet", { exact: true })
      .click();
    await expect(panel).toContainText("Purchase quantity: To confirm");
    await expect(
      row.getByRole("button", { name: "Approve material", exact: true }),
    ).toBeDisabled();
    await panel
      .getByRole("region", { name: "Beam 2", exact: true })
      .getByLabel("Beam length — feet", { exact: true })
      .fill("20");
    await panel.getByLabel("I verified all calculator inputs").check();
    await row
      .getByRole("button", { name: "Approve material", exact: true })
      .click();
    await row
      .getByRole("button", { name: "Back to Materials Summary" })
      .click();
    await page.getByRole("button", { name: /Final Shopping List/ }).click();
    await expect(
      page.getByRole("region", { name: "Approved beam lumber" }),
    ).toContainText("2x10 PT × 12 ft — 3 boards");
    await page
      .getByRole("button", { name: "Send approved materials to estimate" })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!).quotes.find(
              (q: { name: string }) => q.name === "Synthetic simple purchasing",
            ).lines.length,
          storageKey,
        ),
      )
      .toBe(original.length + 2);
    const saved = await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key)!).quotes.find(
          (q: { name: string }) => q.name === "Synthetic simple purchasing",
        ),
      storageKey,
    );
    expect(saved.lines.slice(0, original.length)).toEqual(original);
    expect(saved.lines.at(-1)).toMatchObject({
      quantity: 6,
      cost: 0,
      takeoffId: "beam",
    });
    await expect(
      page.getByRole("button", { name: "Send approved materials to estimate" }),
    ).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
