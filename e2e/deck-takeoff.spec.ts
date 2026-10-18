import { test, expect } from "@playwright/test";
import { constructionPdf } from "./fixtures/constructionPdf";
import { analysisFixture } from "../shared/analysis.fixture";
import type { MaterialInput } from "../shared/materialInputs";
import { storageKey, seed, type Quote } from "../src/model";
const input = (
  field: MaterialInput["field"],
  value: number,
  unit: MaterialInput["unit"],
): MaterialInput => ({
  field,
  value,
  unit,
  page: 1,
  evidence: `D1 explicitly dimensioned ${field}: ${value} ${unit}`,
  readable: true,
});
test("saved dimensions stay prefilled, invalid edits preserve storage and geometry needs explicit confirmation", async ({
  page,
}) => {
  const store = seed(),
    q = store.quotes[0];
  q.status = "Draft";
  q.name = "Synthetic uncertain layout";
  q.takeoff = [
    {
      id: "layout",
      description: "Deck joists",
      specification: "2x8 PT at 16 in OC",
      origin: "ai",
      destination: "Materials",
      category: "Joists",
      documentId: "synthetic",
      page: 1,
      notes: "New work",
      quantity: null,
      unit: "boards",
      status: "Proposed",
      confidence: "High",
      included: true,
      workScope: "New work",
      location: "Deck D1",
      materialInputs: [
        input("layoutLength", 16, "ft"),
        input("memberLength", 10, "ft"),
        input("spacing", 16, "in"),
        input("stock", 12, "ft"),
        input("waste", 0, "%"),
      ],
    },
  ];
  await page.goto("/");
  await page.evaluate(
    ({ key, store }) => localStorage.setItem(key, JSON.stringify(store)),
    { key: storageKey, store },
  );
  await page.reload();
  await page
    .getByRole("button", { name: /Synthetic uncertain layout/ })
    .click();
  await page
    .getByRole("button", { name: "Plans & Takeoff", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Material Takeoff Summary", exact: true })
    .click();
  const card = page.getByRole("article", {
    name: "Takeoff material: Deck joists",
    exact: true,
  });
  await expect(card).toContainText("Material quantity: To confirm");
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    card.getByLabel("Verified layout length (ft)", { exact: true }),
  ).toHaveValue("16");
  await card
    .getByLabel("Selected stock length (ft)", { exact: true })
    .fill("-1");
  await expect(page.getByRole("alert")).toContainText("valid non-negative");
  await expect(
    card.getByLabel("Selected stock length (ft)", { exact: true }),
  ).toHaveValue("12");
  await card
    .getByLabel("Selected stock length (ft)", { exact: true })
    .fill("12");
  await card
    .getByLabel(
      "I verified all measurements, included scope, stock availability, waste and cutting requirements.",
      { exact: true },
    )
    .check();
  await expect(
    card.getByRole("button", { name: "Verify calculation", exact: true }),
  ).toBeDisabled();
  await card
    .getByLabel(
      "I confirmed the regular layout boundary, openings and required edge members.",
      { exact: true },
    )
    .check();
  await card
    .getByRole("button", { name: "Verify calculation", exact: true })
    .click();
  await expect(card).toContainText("13 boards — verified");
  await expect(card.locator(".takeoff-status")).toHaveText(
    "Calculation verified",
  );
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).quotes[0].takeoff[0].status,
        storageKey,
      ),
    )
    .toBe("Proposed");
});
for (const width of [1366, 390])
  test(`automatic deck summary prepares proposals and transfers approved purchasing once at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let documentId = "";
    const original = Buffer.from(
      constructionPdf({
        pages: 2,
        pageNotes: [
          ["DECK D1 LENGTH 16 FT JOISTS 16 IN OC MEMBER LENGTH 10 FT"],
          ["ELEVATION SAME D1 JOISTS NO ADDITIONAL MEMBERS"],
        ],
      }),
      "ascii",
    );
    await page.route("**/api/plan-analysis", async (route) => {
      const documents = route.request().postDataJSON().documents;
      documentId = documents[0].id;
      expect(Buffer.from(documents[0].data.split(",")[1], "base64")).toEqual(
        original,
      );
      const r = analysisFixture(documentId);
      r.dimensions = [];
      const joist = {
        ...r.suggestions[1],
        description: "Deck joists",
        specification: "2x8 PT at 16 in OC",
        category: "Joists",
        quantity: null,
        unit: "boards",
        location: "Deck D1",
        notes: "New work",
        sourceFacts: [
          "Joist layout: D1; clear rectangular layout, both edge members included",
        ],
        materialInputs: [
          input("layoutLength", 16, "ft"),
          input("spacing", 16, "in"),
          input("memberLength", 10, "ft"),
          input("layoutClear", 1, "option"),
          input("edgeIncluded", 1, "option"),
        ],
      };
      r.suggestions = [
        joist,
        {
          ...joist,
          page: 2,
          materialInputs: joist.materialInputs.map((f) => ({ ...f, page: 2 })),
        },
        {
          ...joist,
          description: "Ledger screws",
          category: "Structural fasteners",
          specification: "Specified ledger fastener",
          location: "D1 ledger",
          materialInputs: [
            input("connections", 8, "each"),
            input("piecesPerConnection", 2, "each"),
          ],
          sourceFacts: [
            "Eight ledger connections with two specified screws per connection",
          ],
        },
        {
          ...joist,
          description: "Existing guard to remain",
          specification: "Existing retained guard",
          notes: "Existing guard to remain",
          materialInputs: [],
          sourceFacts: ["Existing guard to remain"],
        },
      ];
      await route.fulfill({ json: r });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Create New Quote" }).click();
    await page.getByLabel("Customer name *").fill("Synthetic test customer");
    await page.getByLabel("Job name *").fill("Synthetic automated deck");
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    await page
      .getByLabel("Attach plans", { exact: true })
      .setInputFiles({
        name: "synthetic-deck.pdf",
        mimeType: "application/pdf",
        buffer: original,
      });
    await expect(page.getByText(/Original PDF view ready/)).toBeVisible();
    await page
      .getByRole("button", { name: "Analyze Plans", exact: true })
      .click();
    await expect(
      page.getByText("Analysis complete — needs review", { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByRole("button", {
        name: "Material Takeoff Summary",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    const summary = page.getByRole("region", {
      name: "Material Takeoff Summary",
      exact: true,
    });
    await expect(summary.locator(".takeoff-summary-card")).toHaveCount(2);
    const joists = summary.getByRole("article", {
      name: "Takeoff material: Deck joists",
      exact: true,
    });
    await expect(joists).toContainText("13 joists");
    await expect(joists).toContainText("Purchasing: To confirm");
    await expect(
      joists.getByRole("button", { name: "Approve", exact: true }),
    ).toBeDisabled();
    await expect(joists.locator("details[open]")).toHaveCount(0);
    const screws = summary.getByRole("article", {
      name: "Takeoff material: Ledger screws",
      exact: true,
    });
    await expect(screws).toContainText("16 each");
    await screws.getByRole("button", { name: "Exclude", exact: true }).click();
    await expect(screws).toHaveCount(0);
    if (width === 1366) {
      await summary.locator(".takeoff-preferences > summary").click();
      await summary
        .getByLabel("Available stock lengths for this quote (ft)", {
          exact: true,
        })
        .fill("8, 12, 16");
      await summary
        .getByLabel("Proposed waste allowance for this quote (%)", {
          exact: true,
        })
        .fill("10");
      await summary
        .getByRole("button", {
          name: "Apply to missing purchasing inputs",
          exact: true,
        })
        .click();
    }
    await joists.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      joists.getByLabel("Verified layout length (ft)", { exact: true }),
    ).toHaveValue("16");
    if (width === 390) {
      await joists
        .getByLabel("Selected stock length (ft)", { exact: true })
        .fill("12");
      await joists
        .getByLabel("Waste allowance (%)", { exact: true })
        .fill("10");
    } else
      await expect(
        joists.getByLabel("Selected stock length (ft)", { exact: true }),
      ).toHaveValue("12");
    await expect(joists).toContainText("15 boards — estimate");
    await joists
      .getByLabel(
        "I verified all measurements, included scope, stock availability, waste and cutting requirements.",
        { exact: true },
      )
      .check();
    await joists
      .getByRole("button", { name: "Verify calculation", exact: true })
      .click();
    await expect(joists).toContainText("Calculation verified");
    await summary.screenshot({
      path: `/tmp/backwoods-reconstructed-takeoff-${width}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    page.once("dialog", (d) => d.accept());
    await joists.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(joists.locator(".takeoff-status")).toHaveText("Approved");
    await page.getByRole("button", { name: /Final Shopping List/ }).click();
    await expect(
      page.getByRole("region", { name: "Grouped approved purchasing list" }),
    ).toContainText("15 boards");
    await page
      .getByRole("button", {
        name: "Send approved materials to estimate",
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key)!)
              .quotes.find((q: Quote) => q.name === "Synthetic automated deck")
              ?.lines.filter(
                (l: { takeoffSource?: unknown }) => l.takeoffSource,
              ).length,
          storageKey,
        ),
      )
      .toBe(1);
    await page.reload();
    await page
      .getByRole("button", { name: /Synthetic automated deck/ })
      .click();
    await page
      .getByRole("button", { name: "Plans & Takeoff", exact: true })
      .click();
    const saved = await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key)!).quotes.find(
          (q: Quote) => q.name === "Synthetic automated deck",
        ),
      storageKey,
    );
    expect(
      saved.takeoff.find(
        (t: { description: string }) => t.description === "Deck joists",
      ).materialInputs.length,
    ).toBe(10);
    expect(
      saved.lines.filter((l: { takeoffSource?: unknown }) => l.takeoffSource),
    ).toHaveLength(1);
    expect(saved.documents[0].id).toBe(documentId);
  });
