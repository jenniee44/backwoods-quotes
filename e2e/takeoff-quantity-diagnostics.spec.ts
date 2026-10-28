import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seed, storageKey, type TakeoffItem } from "../src/model";
import { syntheticDeckBeams } from "../shared/spatialBeam.fixture";
for (const width of [1366, 390])
  test(`saved quantities, non-beam identity and private diagnostic download at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const store = seed(),
      q = store.quotes[0];
    q.status = "Draft";
    q.name = "Synthetic quantity diagnostic";
    q.customer.name = "CONTACT MUST NOT EXPORT";
    const joist: TakeoffItem = {
      id: "joists",
      documentId: "synthetic",
      page: 1,
      description: "Deck joists",
      specification: '2x6 PT at 16" O.C.',
      location: "Deck A",
      quantity: null,
      unit: "boards",
      origin: "ai",
      destination: "Materials",
      status: "Proposed",
      confidence: "High",
      included: true,
      workScope: "New work",
      notes: "New work",
      materialInputs: [
        {
          field: "layoutLength",
          value: 16,
          unit: "ft",
          page: 1,
          evidence: "Explicit perpendicular layout dimension",
          readable: true,
        },
        {
          field: "layoutClear",
          value: 1,
          unit: "option",
          page: 1,
          evidence: "Regular layout without openings",
          readable: true,
        },
        {
          field: "edgeIncluded",
          value: 1,
          unit: "option",
          page: 1,
          evidence: "Both edges included",
          readable: true,
        },
      ],
    };
    q.takeoff = [
      joist,
      {
        ...joist,
        id: "ledger",
        description: "2x6 ledger board with aluminum flashing",
        specification: "2x6 PT",
        category: "Beams",
        location: "Ledger",
        materialInputs: [],
        beamAssemblies: syntheticDeckBeams(),
      },
    ];
    q.analysisReports = [
      {
        id: "saved",
        fingerprint: "synthetic",
        createdAt: new Date().toISOString(),
        assumptions: [],
        warnings: [],
      },
    ];
    const originalLines = structuredClone(q.lines);
    await page.goto("/");
    await page.evaluate(
      ({ store, key }) => localStorage.setItem(key, JSON.stringify(store)),
      { store, key: storageKey },
    );
    for (let reopen = 0; reopen < 2; reopen++) {
      await page.reload();
      await page
        .getByRole("button", { name: /Synthetic quantity diagnostic/ })
        .click();
      await page
        .getByRole("button", { name: "Plans & Takeoff", exact: true })
        .click();
      const summary = page.getByRole("region", {
        name: "Material Takeoff Summary",
        exact: true,
      });
      const row = summary.getByRole("article", {
        name: "Takeoff material: Deck joists",
        exact: true,
      });
      await expect(row).toContainText("13 joists");
      await expect(row).toContainText("Purchasing: To confirm");
      await expect(
        summary.getByLabel("Proposed physical beam lines"),
      ).toHaveCount(0);
    }
    await page
      .getByText("Export saved takeoff analysis", { exact: true })
      .click();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download private analysis JSON" })
      .click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(
      "backwoods-private-takeoff-analysis.json",
    );
    const raw = await readFile((await download.path())!, "utf8"),
      data = JSON.parse(raw);
    expect(raw).not.toContain("CONTACT MUST NOT EXPORT");
    expect(
      data.materials.find((t: { id: string }) => t.id === "joists").proposal,
    ).toMatchObject({ quantity: 13, unit: "joists", purchase: null });
    const saved = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).quotes[0],
      storageKey,
    );
    expect(saved.lines).toEqual(originalLines);
    expect(
      saved.takeoff.every((t: TakeoffItem) => t.status === "Proposed"),
    ).toBe(true);
  });
