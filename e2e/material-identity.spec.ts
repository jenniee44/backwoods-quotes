import { test, expect } from "@playwright/test";
import { seed, storageKey, type TakeoffItem } from "../src/model";

for (const width of [1366, 390])
  test(`saved mixed beam/hanger record repairs before review at ${width}px`, async ({
    page,
  }) => {
    const store = seed(),
      q = store.quotes[0];
    q.name = "Saved identity regression";
    q.takeoffProjectScope = "deck-replacement";
    // Redacted identity/calculation fields from the supplied saved failure.
    // No customer identifiers, drawing coordinates or private document is stored.
    const t: TakeoffItem = {
      id: "mixed",
      documentId: "redacted",
      page: 1,
      origin: "ai",
      status: "Proposed",
      confidence: "Low",
      description:
        "3-ply 2x10 PT beam at connection detail with LUS26 hanger note",
      specification: "3PLY 2X10 PT",
      location: "Connection detail / beam-to-joist support",
      quantity: null,
      unit: "each",
      destination: "Materials",
      included: false,
      workScope: "Requires scope confirmation",
      notes: "Beam length not readable; no purchasing quantity inferred.",
      sourceFacts: ["Simpson LUS26 hanger or equivalent", "3PLY 2X10 PT"],
      materialInputs: [
        {
          field: "connections",
          value: 1,
          unit: "each",
          page: 1,
          readable: true,
          evidence:
            "1 LUS26 hanger or equivalent shown at joist-to-beam connection detail.",
        },
        {
          field: "piecesPerConnection",
          value: 1,
          unit: "each",
          page: 1,
          readable: true,
          evidence: "Single hanger callout at the detail.",
        },
      ],
      calculation: {
        kind: "hardware",
        inputs: { count: 1, pieces: 1 },
        verified: false,
      },
    };
    q.takeoff = [t];
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(
      ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
      { key: storageKey, data: store },
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: /Saved identity regression/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    const table = page.getByRole("table", {
      name: "Preliminary Shopping List",
      exact: true,
    });
    await expect(table).toBeVisible();
    const hanger = table.getByRole("row").filter({ hasText: "Joist hangers" });
    await expect(hanger).toHaveCount(1);
    const specification = hanger.getByRole("textbox", {
      name: /Preliminary specification/,
    });
    await expect(specification).toHaveValue(/LUS26/);
    await expect(specification).not.toHaveValue(/3PLY 2X10/);
    for (const name of [
      "Beams",
      "Deck joists",
      "Deck boards",
      "Guards / railings",
      "Wood stairs",
    ])
      await expect(table).toContainText(name);
    await page.getByRole("button", { name: "Save quote", exact: true }).click();
    const saved = await page.evaluate(
      ({ key, id }) =>
        JSON.parse(localStorage.getItem(key)!).quotes.find(
          (q: { id: string }) => q.id === id,
        ),
      { key: storageKey, id: q.id },
    );
    const hardware = saved.takeoff.filter(
      (t: TakeoffItem) =>
        t.status !== "Rejected" && t.category === "Hangers / connectors",
    );
    expect(hardware).toHaveLength(1);
    expect(hardware[0].quantity).toBeNull();
    expect(hardware[0].calculation?.inputs.count).toBeUndefined();
    expect(
      saved.takeoff.some((t: TakeoffItem) => t.status === "Approved"),
    ).toBe(false);
    expect(
      saved.takeoff.some(
        (t: TakeoffItem) => t.identitySource?.calculation?.inputs.count === 1,
      ),
    ).toBe(true);
  });
