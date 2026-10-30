import { test, expect } from "@playwright/test";
import { seed, storageKey, type TakeoffItem } from "../src/model";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
for (const width of [1366, 390])
  test(`confirmed deck replacement produces a compact complete review list without approval at ${width}px`, async ({
    page,
  }) => {
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic scoped deck";
    q.documents = [
      {
        id: "synthetic",
        name: "Synthetic.pdf",
        type: "application/pdf",
        data: "data:application/pdf;base64,JVBERi0xLjQK",
        addedAt: "2026-01-01",
      },
    ];
    const t: TakeoffItem = {
      id: "mixed",
      documentId: "synthetic",
      page: 1,
      description: '2x6 deck joists @ 16" O.C.',
      specification: "3PLY 2X10 PT",
      category: "Joists",
      location: "Synthetic section",
      origin: "ai",
      status: "Proposed",
      confidence: "Low",
      quantity: null,
      unit: "boards",
      destination: "Informational",
      workScope: "By others / excluded",
      included: false,
      notes: "Verify scope",
      sourceFacts: [
        '2x6 deck joists @ 16" O.C.',
        "Simpson LUS26 hanger or equivalent",
        "Exterior guards by others",
        "Existing concrete pier and footing to remain",
      ],
      beamAssemblies: syntheticDeckBeams(),
    };
    q.takeoff = [t];
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
      { key: storageKey, data: store },
    );
    await page.goto("/");
    await page.getByRole("button", { name: /Synthetic scoped deck/ }).click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .getByText("Deck replacement — confirm the work included", {
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Prepare deck replacement list" }),
    ).toBeDisabled();
    await page
      .getByLabel(
        "This is my confirmed project scope. Add unresolved required materials for review; do not approve or price them.",
      )
      .check();
    await page
      .getByRole("button", { name: "Prepare deck replacement list" })
      .click();
    const table = page.getByRole("table", {
      name: "Preliminary Shopping List",
      exact: true,
    });
    await expect(table).toBeVisible();
    for (const text of [
      "Beams",
      "Deck joists",
      "Deck boards",
      "Guards / railings",
      "Wood stairs",
      "Joist hangers",
    ])
      await expect(table).toContainText(text);
    await expect(
      page.getByRole("button", { name: /Final Shopping List/ }),
    ).toContainText("(0)");
    await page.getByRole("button", { name: "Save quote", exact: true }).click();
    const raw = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!),
      storageKey,
    );
    const saved = raw.quotes.find(
      (v: { name: string }) => v.name === "Synthetic scoped deck",
    );
    expect(
      saved.takeoff.every((v: { status: string }) => v.status !== "Approved"),
    ).toBe(true);
    expect(
      saved.takeoff.some(
        (v: { destination: string; description: string }) =>
          v.destination === "Labour" && /demolition/.test(v.description),
      ),
    ).toBe(true);
    expect(
      saved.takeoff.some(
        (v: { destination: string; description: string }) =>
          v.destination === "Other Costs" && /Disposal bin/.test(v.description),
      ),
    ).toBe(true);
    expect(
      saved.takeoff.find((v: { id: string }) => v.id === "mixed").category,
    ).toBe("Beams");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
