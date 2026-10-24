import { test, expect } from "@playwright/test";
import { seed, storageKey, type TakeoffItem } from "../src/model";
import {
  syntheticDeckBeams,
  fullDimension,
} from "../shared/spatialBeam.fixture";
for (const width of [1366, 390])
  test(`unresolved beam scope uses the beam calculator automatically and preserves saved edits at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic scope-prefill regression";
    const beams = syntheticDeckBeams();
    beams.forEach((b) => (b.scope = "Requires scope confirmation"));
    beams[0].dimensions.push(fullDimension(beams[0], "12'-6\""));
    const t: TakeoffItem = {
      id: "scope-prefill",
      documentId: "synthetic",
      page: 1,
      description: "3PLY 2X10 PT beam assembly",
      quantity: null,
      unit: "runs",
      origin: "ai",
      status: "Proposed",
      confidence: "Unspecified",
      classification: "Contractor input required",
      destination: "Materials",
      notes: "Scope requires contractor confirmation",
      workScope: "Requires scope confirmation",
      included: false,
      beamAssemblies: beams,
    };
    q.takeoff = [t];
    const manual = structuredClone(q.lines);
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    for (let reopening = 0; reopening < 2; reopening++) {
      await page.reload();
      await page
        .getByRole("button", { name: /Synthetic scope-prefill regression/ })
        .click();
      await page
        .getByRole("button", { name: "Plans & Takeoff", exact: true })
        .click();
      await page.locator(".advanced-review > summary").click();
      const material = page.locator("#takeoff-scope-prefill");
      await material.locator(".takeoff-evidence > summary").click();
      const panel = material.getByRole("group", {
        name: "Material purchasing calculator",
      });
      await expect(
        panel.getByLabel("Material calculator", { exact: true }),
      ).toHaveValue("beam-runs");
      await expect(panel.getByLabel("Calculator specifications")).toHaveValue(
        "3PLY 2X10 PT",
      );
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
        ).toHaveValue(reopening && n === 2 ? "" : "3");
        await expect(
          card.getByLabel("Stock board length (ft)", { exact: true }),
        ).toHaveValue("");
        await expect(
          card.getByLabel("Beam length — feet", { exact: true }),
        ).toHaveValue(n === 1 ? "12" : "");
      }
      await expect(
        panel
          .getByRole("region", { name: "Beam 1", exact: true })
          .getByLabel("Beam length — inches", { exact: true }),
      ).toHaveValue("6");
      await expect(
        material.getByRole("button", { name: "Approve material", exact: true }),
      ).toBeDisabled();
      await expect(panel).toContainText("Purchase quantity: To confirm");
      const confirm = panel.getByLabel(
        "I verified that the proposed beam lines are included in this work",
      );
      await expect(confirm).not.toBeChecked();
      await confirm.check();
      await expect
        .poll(() =>
          page.evaluate(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff[0]
                .scopeVerified,
            storageKey,
          ),
        )
        .toBe(true);
      if (!reopening) {
        await panel
          .getByRole("region", { name: "Beam 2", exact: true })
          .getByLabel("Number of plies", { exact: true })
          .fill("");
        await panel
          .getByRole("region", { name: "Beam 2", exact: true })
          .getByLabel("Number of plies", { exact: true })
          .blur();
        await expect
          .poll(() =>
            page.evaluate(
              (key) =>
                JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff[0]
                  .calculation.inputs.plies2,
              storageKey,
            ),
          )
          .toBeNull();
      }
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).quotes[0],
        storageKey,
      );
      expect(saved.lines).toEqual(manual);
      expect(saved.takeoff[0].status).toBe("Proposed");
      expect(saved.takeoff[0].calculation.verified).toBe(false);
    }
  });
